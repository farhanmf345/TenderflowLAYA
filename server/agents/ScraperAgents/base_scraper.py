"""
Base Scraper - TenderFlow v4.0 ScraperAgents/base_scraper.py

Reusable base class for all portal scraper agents.
Instantiate via create_scraper(agent_id, db) factory function.

Responsibilities:
  1. Load portal + keywords from DB
  2. Read global scraper params from CompanyMaster
  3. Fetch portal pages (httpx) with retry logic
  4. Extract tenders via Gemini Pro (structured JSON)
  5. Apply PRE_FILTER participation criteria early (discard non-matching tenders)
  6. Log token usage to AITokenUsageLog for every Gemini call
  7. Return List[RawTender] to ParentAgent

PRE_FILTER criteria applied per linked Department:
  - tender_value_cr, deadline_days_remaining, source_portal, issuing_state, org_type
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

import httpx
import google.genai as _new_genai
from google.genai import types as _genai_types

from core.criteria_fields import dept_rules_pass, resolve_pre_filter_value
from config.settings import settings
from core.database import SessionLocal
from core.models import (
    ScraperAgentMaster, CompanyMaster,
    DepartmentPortalMapping, DepartmentKeywordMapping, KeywordMaster,
    ParticipationCriteriaMaster, AITokenUsageLog,
)
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_FLASH_MODEL = settings.gemini_flash_model   # used for token cost logging label only
_PRO_MODEL   = settings.gemini_pro_model     # scraper extraction + grounded search (higher accuracy)

# New SDK client
_genai_client = _new_genai.Client(api_key=settings.gemini_api_key)
_SEARCH_TOOL  = _genai_types.Tool(google_search=_genai_types.GoogleSearch())

# ─── Gemini pricing (USD per 1M tokens) ──────────────────────────────────────
_MODEL_PRICING = {
    _PRO_MODEL:   {"input": 3.50,  "output": 10.50},
    _FLASH_MODEL: {"input": 0.075, "output": 0.30},
    "gemini-3-flash-preview": {"input": 0.075, "output": 0.30},
    "gemini-3.1-pro-preview": {"input": 3.50,  "output": 10.50},
}

def _calc_cost(input_tokens: int, output_tokens: int, model: str = _PRO_MODEL) -> float:
    rates = _MODEL_PRICING.get(model, {"input": 0.075, "output": 0.30})
    return round(
        (input_tokens  * rates["input"]  / 1_000_000) +
        (output_tokens * rates["output"] / 1_000_000),
        6,
    )


# ─── RawTender dataclass ──────────────────────────────────────────────────────

@dataclass
class RawTender:
    name: str
    issuing_organisation: str
    description: str
    tender_value_cr: Optional[float]
    published_date: Optional[datetime]
    deadline: Optional[datetime]
    url: Optional[str]
    source_domain: str
    keywords: List[str] = field(default_factory=list)
    tender_ref_number: Optional[str] = None   # for fingerprint dedup
    issuing_state: Optional[str] = None       # for PRE_FILTER + fingerprint


# ─── Gemini extraction prompt ─────────────────────────────────────────────────

_EXTRACT_PROMPT = """
You are a professional tender data extraction agent.
Your ONLY job is to extract tender data EXACTLY as it appears on the page.

STRICT RULES:
1. Copy tender names and all fields WORD-FOR-WORD from the page. Do NOT paraphrase, summarize, or modify any text.
2. SKIP any tender whose submission deadline has already passed OR is less than 3 days from today ({today}).
3. If you cannot find a field, return null. Do NOT guess or invent any values.
4. Only include genuine procurement tenders — skip press releases, notices, and results.
5. Return empty array [] if no valid, future tenders are found.

Return a JSON array with this exact schema (no markdown, no explanation):

[
  {{
    "tender_name": "EXACT title as shown on the page",
    "issuing_organisation": "exact organisation name as shown",
    "tender_ref_number": "exact reference/NIT/bid number or null",
    "issuing_state": "Indian state name or null",
    "description": "exact description from page, max 500 chars, or null",
    "tender_value_cr": null_or_float_in_crores,
    "published_date": "YYYY-MM-DD or null",
    "deadline": "YYYY-MM-DD or null",
    "website_url": "full URL to tender detail page or null",
    "keywords_matched": ["keyword1", ...]
  }}
]

Target keywords (match any): {keywords}

Page content:
{content}
"""

_SEARCH_PROMPT = """
You are a professional tender data extraction agent using Google Search.
Search the website {domain} for ACTIVE tender notices.

STRICT RULES:
1. Return ONLY tenders whose submission deadline is at least 3 days from today ({today}). Skip expired tenders.
2. Use EXACT tender titles and details as published. Do NOT paraphrase or modify text.
3. If a field is not found, return null. Do NOT invent values.
4. Only include genuine procurement tenders — skip press releases and results.
5. Return empty array [] if no valid tenders are found.

Return a JSON array with this exact schema (no markdown, no explanation):

[
  {{
    "tender_name": "EXACT title as published",
    "issuing_organisation": "exact organisation name",
    "tender_ref_number": "exact reference/NIT/bid number or null",
    "issuing_state": "Indian state name or null",
    "description": "exact description, max 500 chars, or null",
    "tender_value_cr": null_or_float_in_crores,
    "published_date": "YYYY-MM-DD or null",
    "deadline": "YYYY-MM-DD or null",
    "website_url": "full URL to tender detail page or null",
    "keywords_matched": ["keyword1", ...]
  }}
]

Target keywords (match ANY): {keywords}
"""


# ─── Base Scraper class ───────────────────────────────────────────────────────

class BaseScraper:
    """
    Reusable scraper for one portal agent.
    Instantiate via create_scraper() factory - do not construct directly.
    """

    def __init__(self, agent_record: ScraperAgentMaster, db: Session):
        self.agent = agent_record
        self.portal = agent_record.portal
        self.db = db

        # Load global scraper params from CompanyMaster
        company = db.query(CompanyMaster).first()
        self.gap            = company.Scrape_Gap_Sec     if company else 10.0
        self.max_retries    = company.Max_Retries        if company else 2
        self.retry_interval = company.Retry_Interval_Sec if company else 60.0

    # ── Keyword aggregation ───────────────────────────────────────────────────

    def _get_keywords(self) -> List[str]:
        """Union of all keywords from Departments linked to this portal."""
        dept_ids = [
            m.Department_ID
            for m in self.db.query(DepartmentPortalMapping).filter_by(
                Portal_ID=self.portal.Portal_ID
            ).all()
        ]
        if not dept_ids:
            logger.warning(f"[Scraper] No departments linked to portal {self.portal.Portal_Name}")
            return []

        kw_ids = set(
            m.Keyword_ID
            for m in self.db.query(DepartmentKeywordMapping).filter(
                DepartmentKeywordMapping.Department_ID.in_(dept_ids)
            ).all()
        )
        keywords = [
            kw.Keyword
            for kw in self.db.query(KeywordMaster).filter(
                KeywordMaster.Keyword_ID.in_(kw_ids)
            ).all()
        ]
        logger.info(f"[Scraper] {len(keywords)} keywords for {self.portal.Portal_Name}")
        return list(set(keywords))

    # ── HTTP fetch with retry ─────────────────────────────────────────────────

    async def _fetch_page(self, url: str) -> Optional[str]:
        """Fetch raw page text with retry logic."""
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url

        for attempt in range(1, self.max_retries + 2):
            try:
                async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                    headers = {
                        "User-Agent": (
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/124.0 Safari/537.36"
                        )
                    }
                    resp = await client.get(url, headers=headers)
                    resp.raise_for_status()
                    
                    # Handle HTML meta-refresh (common on govt portals like eprocure)
                    meta_refresh = re.search(r'<meta[^>]+http-equiv=["\']refresh["\'][^>]+content=["\']\d+;\s*URL=([^"\']+)["\']', resp.text, re.IGNORECASE)
                    if meta_refresh:
                        redirect_url = meta_refresh.group(1).strip()
                        if not redirect_url.startswith('http'):
                            # Handle relative meta refresh
                            base = url.rstrip('/')
                            redirect_url = f"{base}/{redirect_url.lstrip('/')}"
                        logger.info(f"[Scraper] Meta refresh detected, following to {redirect_url}")
                        resp = await client.get(redirect_url, headers=headers)
                        resp.raise_for_status()

                    text = re.sub(r"<[^>]+>", " ", resp.text)
                    text = re.sub(r"\s+", " ", text).strip()
                    # Government sites have massive headers. Increase limit from 8K to 200K chars
                    return text[:200000]
            except Exception as e:
                logger.warning(f"[Scraper] Fetch attempt {attempt} failed for {url}: {e}")
                if attempt <= self.max_retries:
                    await asyncio.sleep(self.retry_interval)
        return None

    # ── Gemini extraction ─────────────────────────────────────────────────────

    async def _extract_with_gemini(
        self, page_text: str, keywords: List[str]
    ) -> List[dict]:
        """Send raw page text to Gemini Pro and parse the returned JSON array.
        Logs token usage to AITokenUsageLog."""
        from datetime import date
        prompt = _EXTRACT_PROMPT.format(
            today=date.today().isoformat(),
            keywords=", ".join(keywords),
            content=page_text,
        )
        # Debug: show first 300 chars to confirm page content is real
        logger.debug(f"[Scraper] Page content preview: {page_text[:300]!r}")
        try:
            response = await _genai_client.aio.models.generate_content(
                model=_PRO_MODEL,
                contents=prompt,
            )
            meta     = getattr(response, "usage_metadata", None)
            input_t  = getattr(meta, "prompt_token_count", 0) or 0
            output_t = getattr(meta, "candidates_token_count", 0) or 0
            self._log_tokens(_PRO_MODEL, input_t, output_t)

            raw = response.text.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            return json.loads(raw)
        except Exception as e:
            logger.error(f"[Scraper] Gemini extraction failed: {e}")
            return []

    async def _search_with_gemini(
        self, domain: str, keywords: List[str]
    ) -> List[dict]:
        """
        Fallback: use Gemini's Google Search grounding to directly search the
        portal domain for active tenders. This bypasses JS-rendering issues on
        portals like eprocure.gov.in where httpx only gets a static HTML shell.
        """
        from datetime import date
        prompt = _SEARCH_PROMPT.format(
            domain=domain,
            today=date.today().isoformat(),
            keywords=", ".join(keywords),
        )
        logger.info(f"[Scraper] 🔍 Falling back to Gemini grounded search for {domain}")
        try:
            response = await _genai_client.aio.models.generate_content(
                model=_PRO_MODEL,
                contents=prompt,
                config=_genai_types.GenerateContentConfig(
                    tools=[_SEARCH_TOOL],
                ),
            )
            meta     = getattr(response, "usage_metadata", None)
            input_t  = getattr(meta, "prompt_token_count", 0) or 0
            output_t = getattr(meta, "candidates_token_count", 0) or 0
            self._log_tokens(_PRO_MODEL, input_t, output_t)

            raw = response.text.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            return json.loads(raw)
        except Exception as e:
            logger.error(f"[Scraper] Gemini grounded search failed: {e}")
            return []

    # ── Token usage logging ───────────────────────────────────────────────────

    def _log_tokens(
        self, model: str, input_tokens: int, output_tokens: int,
        tender_id: Optional[int] = None,
    ):
        """Write a row to AITokenUsageLog."""
        try:
            self.db.add(AITokenUsageLog(
                Stage="SCRAPE",
                Model=model,
                Input_Tokens=input_tokens,
                Output_Tokens=output_tokens,
                Estimated_Cost_USD=_calc_cost(input_tokens, output_tokens, model),
                Scraper_Agent_ID=self.agent.ScraperAgent_ID,
                Tender_ID=tender_id,
            ))
            self.db.commit()
        except Exception as e:
            logger.warning(f"[Scraper] Token log write failed: {e}")

    # ── PRE_FILTER rule engine ────────────────────────────────────────────────

    def _get_dept_ids(self) -> List[int]:
        return [
            m.Department_ID
            for m in self.db.query(DepartmentPortalMapping).filter_by(
                Portal_ID=self.portal.Portal_ID
            ).all()
        ]

    def _apply_pre_filters(self, rt: RawTender, dept_ids: List[int]) -> Optional[str]:
        """
        Apply PRE_FILTER per linked department.
        Pass if ANY department accepts; discard only if ALL reject.
        """
        if not dept_ids:
            return None

        rules = self.db.query(ParticipationCriteriaMaster).filter(
            ParticipationCriteriaMaster.Department_ID.in_(dept_ids),
            ParticipationCriteriaMaster.Criteria_Type == "PRE_FILTER",
            ParticipationCriteriaMaster.Is_Active == True,
        ).all()

        return dept_rules_pass(rules, dept_ids, self._resolve_field, rt)

    def _resolve_field(self, rt: RawTender, field: str):
        from core.criteria_fields import normalize_pre_field

        actual_field = normalize_pre_field(field)

        if actual_field == "sector":
            from core.models import SectorMaster, KeywordMaster as _KM
            sector_votes = {}
            if rt.keywords:
                kw_lower = [k.lower() for k in rt.keywords]
                kw_records = self.db.query(_KM).all()
                for kw_rec in kw_records:
                    if kw_rec.Keyword.lower() in kw_lower:
                        sid = kw_rec.Sector_ID
                        sector_votes[sid] = sector_votes.get(sid, 0) + 1
            if not sector_votes:
                text = f"{rt.name} {rt.description}".lower()
                sectors = self.db.query(SectorMaster).filter_by(Is_Active=True).all()
                for s in sectors:
                    if s.Sector_Name.lower() in text:
                        sector_votes[s.Sector_ID] = sector_votes.get(s.Sector_ID, 0) + 2

            if sector_votes:
                best_sid = max(sector_votes, key=sector_votes.get)
            else:
                fallback = self.db.query(SectorMaster).filter_by(Is_Active=True).first()
                best_sid = fallback.Sector_ID if fallback else 1

            sector_rec = self.db.query(SectorMaster).filter_by(Sector_ID=best_sid).first()
            return sector_rec.Sector_Name if sector_rec else None

        return resolve_pre_filter_value(rt, actual_field)

    # ── Date parser ───────────────────────────────────────────────────────────

    def _parse_date(self, val: Optional[str]) -> Optional[datetime]:
        if not val:
            return None
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y"):
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                continue
        return None

    # ── Main scrape entry point ───────────────────────────────────────────────

    async def scrape(self, max_results: int = 30) -> List[RawTender]:
        """
        Fetch portal page, extract tenders via Gemini, apply PRE_FILTER,
        and return List[RawTender].

        Strategy:
        1. Try httpx fetch + Gemini HTML parsing (fast, free)
        2. If 0 tenders extracted (JS-rendered portals), fall back to
           Gemini Google Search grounding (slower but bypasses JS issues)
        """
        keywords  = self._get_keywords()
        base_url  = self.portal.Base_URL
        domain    = re.sub(r"https?://", "", base_url).split("/")[0]
        dept_ids  = self._get_dept_ids()

        logger.info(f"[Scraper] Fetching {base_url}")
        page_text = await self._fetch_page(base_url)

        if not page_text:
            # httpx completely failed - skip straight to Gemini search
            logger.warning(f"[Scraper] Could not fetch {base_url} - trying Gemini grounded search")
            raw_list = await self._search_with_gemini(domain, keywords)
        else:
            raw_list = await self._extract_with_gemini(page_text, keywords)
            logger.info(f"[Scraper] Gemini returned {len(raw_list)} tenders from {self.portal.Portal_Name}")

            # Fallback: if fetch worked but page is JS-rendered (0 tenders extracted)
            if len(raw_list) == 0:
                logger.info(f"[Scraper] 0 from HTML parse - likely JS-rendered portal. Trying Gemini grounded search.")
                raw_list = await self._search_with_gemini(domain, keywords)
                logger.info(f"[Scraper] Grounded search returned {len(raw_list)} tenders from {domain}")

        results: List[RawTender] = []
        for idx, item in enumerate(raw_list[:max_results]):
            if idx > 0 and self.gap > 0:
                await asyncio.sleep(self.gap)
            rt = RawTender(
                name=str(item.get("tender_name") or "Unknown Tender"),
                issuing_organisation=str(item.get("issuing_organisation") or ""),
                description=str(item.get("description") or ""),
                tender_value_cr=item.get("tender_value_cr"),
                published_date=self._parse_date(item.get("published_date")),
                deadline=self._parse_date(item.get("deadline")),
                url=item.get("website_url"),
                source_domain=domain,
                keywords=item.get("keywords_matched") or [],
                tender_ref_number=item.get("tender_ref_number"),
                issuing_state=item.get("issuing_state"),
            )

            # Apply PRE_FILTER early - discard non-matching tenders before DB write
            failed_rule = self._apply_pre_filters(rt, dept_ids)
            if failed_rule:
                logger.info(f"[Scraper] PRE_FILTER discard ('{failed_rule}'): {rt.name[:60]}")
                continue

            results.append(rt)

        logger.info(
            f"[Scraper] {len(results)}/{len(raw_list)} tenders passed PRE_FILTER "
            f"for {self.portal.Portal_Name}"
        )
        return results


# ─── Factory function ─────────────────────────────────────────────────────────

def create_scraper(agent_id: int, db: Session) -> BaseScraper:
    """
    Factory: load ScraperAgentMaster by ID and return a BaseScraper instance.
    Called by ParentAgent instead of instantiating ScraperAgent directly.
    """
    agent_record = db.query(ScraperAgentMaster).filter_by(
        ScraperAgent_ID=agent_id
    ).first()
    if not agent_record:
        raise ValueError(f"ScraperAgentMaster ID={agent_id} not found")
    return BaseScraper(agent_record=agent_record, db=db)
