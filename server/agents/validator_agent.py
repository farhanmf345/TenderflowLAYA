"""
Validator Agent - TenderFlow v4.0

3-layer deduplication + validation pipeline:

  [1]  v   Pre-check   - Gemini Flash asks: "NEW or DUPLICATE?"
  [2] Fingerprint Check - MySQL: issuing_org + tender_ref + deadline composite
  [3] ChromaDB Dedup    - cosine similarity >= 0.96 threshold

  Then: Freshness → Whitelist → PRE_FILTER rules → Store (MySQL + ChromaDB)

Notes:
  - Flash pre-check is intentionally non-blocking: if Gemini fails, we proceed.
  - Fingerprint only runs when tender_ref_number is populated (extracted by scraper).
  - Token usage is logged per Flash call to AITokenUsageLog.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

import google.genai as genai
from sqlalchemy.orm import Session
from sqlalchemy import func

from config.settings import settings
from core.models import (
    TenderDetails, WhitelistPortalMaster, SectorMaster,
    DepartmentPortalMapping, ParticipationCriteriaMaster,
    ActivityLog, AITokenUsageLog, CompanyMaster, CertificateMaster,
)
from core import chroma_client
from core.tender_requirements import classify_requirements
from core.criteria_fields import dept_rules_pass, resolve_pre_filter_value
from agents.ScraperAgents.base_scraper import RawTender, _calc_cost

logger = logging.getLogger(__name__)

_genai_client = genai.Client(api_key=settings.gemini_api_key)
_FLASH_MODEL = settings.gemini_flash_model   # pre-checks + summary generation
_PRO_MODEL   = settings.gemini_pro_model     # upgrade path for more accurate pre-checks


FRESHNESS_MIN_DAYS = 3   # deadline must be at least 3 days from now


class ValidatorAgent:
    """Validates a RawTender through the 3-layer dedup + validation pipeline."""

    # ─── Public validate() ────────────────────────────────────────────────────

    async def validate(
        self,
        raw_tender: RawTender,
        portal_id: int,
        scraper_agent_id: Optional[int] = None,
        db: Session = None,
    ) -> Optional[int]:
        """
        Run the full validation pipeline.
        Returns Tender_ID if tender passes all checks and is stored.
        Returns None if rejected at any stage.
        """
        name = raw_tender.name[:80]

        # ── Preemptive Fingerprint / Name Duplicate & Modification Check ──
        existing_tender = None
        if raw_tender.tender_ref_number:
            existing_tender = db.query(TenderDetails).filter(
                TenderDetails.Tender_Ref_Number == raw_tender.tender_ref_number,
                TenderDetails.Issuing_Organisation == raw_tender.issuing_organisation,
            ).first()

        if not existing_tender:
            existing_tender = db.query(TenderDetails).filter(
                func.lower(TenderDetails.Tender_NAME) == func.lower(raw_tender.name.strip()),
                TenderDetails.Issuing_Organisation == raw_tender.issuing_organisation,
            ).first()

        if existing_tender:
            # Check if details changed
            deadline_changed = False
            if raw_tender.deadline and existing_tender.Deadline:
                if raw_tender.deadline != existing_tender.Deadline:
                    deadline_changed = True
            elif raw_tender.deadline or existing_tender.Deadline:
                deadline_changed = True

            desc_changed = (raw_tender.description or "").strip() != (existing_tender.Description or "").strip()

            from agents.qualifier_agent import QualifierAgent
            existing_val = QualifierAgent._infer_tender_value(existing_tender)
            
            temp_td = TenderDetails(Tender_NAME=raw_tender.name, Description=raw_tender.description)
            rt_val = raw_tender.tender_value_cr if raw_tender.tender_value_cr is not None else QualifierAgent._infer_tender_value(temp_td)

            val_changed = False
            if rt_val is not None and existing_val is not None:
                if abs(rt_val - existing_val) > 0.001:
                    val_changed = True
            elif rt_val is not None or existing_val is not None:
                val_changed = True

            clarification_changed = False
            if hasattr(raw_tender, 'clarification_meeting_date') and raw_tender.clarification_meeting_date != existing_tender.Clarification_Meeting_Date:
                clarification_changed = True

            query_deadline_changed = False
            if hasattr(raw_tender, 'query_submission_deadline') and raw_tender.query_submission_deadline != existing_tender.Query_Submission_Deadline:
                query_deadline_changed = True

            final_submission_changed = False
            if hasattr(raw_tender, 'final_submission_deadline') and raw_tender.final_submission_deadline != existing_tender.Final_Submission_Deadline:
                final_submission_changed = True

            details_changed = (
                deadline_changed or
                desc_changed or
                val_changed or
                clarification_changed or
                query_deadline_changed or
                final_submission_changed
            )

            if details_changed:
                logger.info(f"[Validator] Modification Detected - Updating Tender_ID={existing_tender.Tender_ID} ({name})")
                
                # Update attributes
                existing_tender.Tender_NAME = raw_tender.name
                existing_tender.Description = raw_tender.description
                if raw_tender.deadline:
                    existing_tender.Deadline = raw_tender.deadline
                if raw_tender.published_date:
                    existing_tender.Tender_PUB_Date = raw_tender.published_date
                if raw_tender.url:
                    existing_tender.Website_URL = raw_tender.url
                if raw_tender.keywords:
                    existing_tender.Keyword_JSON = json.dumps(raw_tender.keywords)
                
                if hasattr(raw_tender, 'clarification_meeting_date') and raw_tender.clarification_meeting_date:
                    existing_tender.Clarification_Meeting_Date = raw_tender.clarification_meeting_date
                if hasattr(raw_tender, 'query_submission_deadline') and raw_tender.query_submission_deadline:
                    existing_tender.Query_Submission_Deadline = raw_tender.query_submission_deadline
                if hasattr(raw_tender, 'final_submission_deadline') and raw_tender.final_submission_deadline:
                    existing_tender.Final_Submission_Deadline = raw_tender.final_submission_deadline
                
                sector_id = self._resolve_sector(
                    db,
                    keywords=raw_tender.keywords,
                    name=raw_tender.name,
                    description=raw_tender.description,
                )
                existing_tender.Sector_ID = sector_id
                existing_tender.Tender_Summary = await self._generate_summary(raw_tender.name, raw_tender.description)
                existing_tender.Tender_Status = "MODIFIED"
                
                db.commit()

                # Update ChromaDB embedding since text changed
                combined_text = f"{raw_tender.name} {raw_tender.issuing_organisation} {raw_tender.description}"
                if existing_tender.Chroma_ID:
                    try:
                        chroma_client.add_embedding(
                            chroma_id=existing_tender.Chroma_ID,
                            text=combined_text,
                            metadata={
                                "tender_id":   existing_tender.Tender_ID,
                                "portal_id":   portal_id,
                                "source":      raw_tender.source_domain,
                                "deadline":    str(existing_tender.Deadline),
                            },
                        )
                    except Exception as e:
                        logger.warning(f"[Validator] ChromaDB update failed: {e}")

                self._log(db, "TENDER_UPDATED", existing_tender.Tender_ID, None, scraper_agent_id,
                          detail={"tender": name, "reason": "Tender details modified"})
                return existing_tender.Tender_ID
            else:
                logger.info(f"[Validator] Preemptive Dedup: Identical Duplicate - {name}")
                self._log(db, "FINGERPRINT_DISCARD", None, None, scraper_agent_id,
                          detail={"tender": name, "reason": "Identical existing match (org+ref/name)"})
                return None

        # ── [1] Flash Pre-check ──────────────────────────────────────────────
        verdict = await self._pro_precheck(raw_tender, scraper_agent_id, db)
        if verdict == "DUPLICATE":
            logger.info(f"[Validator] Flash: DUPLICATE - {name}")
            self._log(db, "FLASH_DISCARD", None, None, scraper_agent_id,
                      detail={"tender": name, "reason": "Flash pre-check flagged as duplicate"})
            return None

        # ── [2] Structured Fingerprint Check ────────────────────────────────
        if self._fingerprint_exists(raw_tender, db):
            logger.info(f"[Validator] Fingerprint: EXISTS - {name}")
            self._log(db, "FINGERPRINT_DISCARD", None, None, scraper_agent_id,
                      detail={"tender": name, "reason": "Composite key match (org+ref+deadline)"})
            return None

        # ── [3] ChromaDB Cosine Similarity Dedup ────────────────────────────
        combined_text = f"{raw_tender.name} {raw_tender.issuing_organisation} {raw_tender.description}"
        # Read threshold from CompanyMaster so it's configurable from Scraper Config page
        _company = db.query(CompanyMaster).first()
        _chroma_threshold = getattr(_company, 'ChromaDB_Dedup_Threshold', 0.96) if _company else 0.96
        is_dup, existing_id = chroma_client.check_dedup(combined_text, threshold=_chroma_threshold)
        if is_dup:
            logger.info(f"[Validator] ChromaDB: DUPLICATE (existing={existing_id}, threshold={_chroma_threshold}) - {name}")
            self._log(db, "DEDUP_DISCARD", None, None, scraper_agent_id,
                      detail={"tender": name, "reason": f"ChromaDB similarity match: {existing_id}"})
            return None

        # ── [4] Freshness Check ──────────────────────────────────────────────
        if raw_tender.deadline:
            days_remaining = (raw_tender.deadline - datetime.now()).days
            if days_remaining < FRESHNESS_MIN_DAYS:
                logger.info(f"[Validator] Stale ({days_remaining}d remaining) - {name}")
                self._log(db, "SIGNAL_DISCARD", None, None, scraper_agent_id,
                          detail={"tender": name, "reason": f"Deadline too soon ({days_remaining} days)"})
                return None

        # ── [5] Whitelist Check ──────────────────────────────────────────────
        portal = db.query(WhitelistPortalMaster).filter_by(Portal_ID=portal_id).first()
        if not portal:
            logger.warning(f"[Validator] Portal {portal_id} not in whitelist - {name}")
            self._log(db, "SIGNAL_DISCARD", None, None, scraper_agent_id,
                      detail={"tender": name, "reason": "Portal not whitelisted"})
            return None

        # ── [6] PRE_FILTER Rules (dept-level second pass) ───────────────────
        dept_ids = [
            m.Department_ID
            for m in db.query(DepartmentPortalMapping).filter_by(Portal_ID=portal_id).all()
        ]
        fail = self._run_pre_filters(raw_tender, dept_ids, db)
        if fail:
            logger.info(f"[Validator] PRE_FILTER fail ({fail}) - {name}")
            self._log(db, "SIGNAL_DISCARD", None, None, scraper_agent_id,
                      detail={"tender": name, "reason": f"PRE_FILTER: {fail}"})
            return None

        # ── [7] Resolve Sector from tender keywords/title ────────────────────
        sector_id = self._resolve_sector(
            db,
            keywords=raw_tender.keywords,
            name=raw_tender.name,
            description=raw_tender.description,
        )

        # ── [8] Generate 1-line summary (non-blocking) ───────────────────────
        tender_summary = await self._generate_summary(raw_tender.name, raw_tender.description)

        # ── [8b] Requirement classifier (non-blocking, off unless configured) ─
        requirements_json = await self._classify_requirements(raw_tender, db)

        # ── [9] Write to DB ──────────────────────────────────────────────────
        tender = TenderDetails(
            Tender_NAME=raw_tender.name,
            Tender_Ref_Number=raw_tender.tender_ref_number,
            Sector_ID=sector_id,
            Portal_ID=portal_id,
            Tender_PUB_Date=raw_tender.published_date,
            Deadline=raw_tender.deadline or datetime.now() + timedelta(days=30),
            Website_URL=raw_tender.url,
            Keyword_JSON=json.dumps(raw_tender.keywords),
            Score=0,
            Indexed=False,
            Chroma_ID=None,
            Issuing_Organisation=raw_tender.issuing_organisation,
            Issuing_State=raw_tender.issuing_state,
            Description=raw_tender.description,
            Source_Domain=raw_tender.source_domain,
            Tender_Summary=tender_summary,
            Requirements_JSON=requirements_json,
            Tender_Status="NEW",
        )
        db.add(tender)
        db.commit()
        db.refresh(tender)

        # ── [9] Write to ChromaDB ────────────────────────────────────────────
        chroma_id = f"tender-{tender.Tender_ID}"
        chroma_client.add_embedding(
            chroma_id=chroma_id,
            text=combined_text,
            metadata={
                "tender_id":   tender.Tender_ID,
                "portal_id":   portal_id,
                "source":      raw_tender.source_domain,
                "deadline":    str(tender.Deadline),
            },
        )
        tender.Chroma_ID = chroma_id
        tender.Indexed   = True
        db.commit()

        self._log(db, "VALIDATION_PASS", tender.Tender_ID, None, scraper_agent_id,
                  detail={"tender": name, "source": raw_tender.source_domain})
        logger.info(f"[Validator] ✓ Stored Tender_ID={tender.Tender_ID} - {name}")
        return tender.Tender_ID

    # ─── [1] Flash Pre-check ──────────────────────────────────────────────────

    async def _generate_summary(self, name: str, description: str) -> str | None:
        """Generate a 1-2 sentence plain-English tender summary via Gemini Flash.
        Non-blocking — returns None on any failure."""
        try:
            snippet = (description or "")[:1000].strip()
            if not snippet:
                return None
            prompt = (
                f"Tender title: {name}\n"
                f"Description snippet: {snippet}\n\n"
                "Write a single sentence (max 30 words) summarising what this tender is for. "
                "Be specific, plain English, no jargon. No bullet points. Just the sentence."
            )
            resp = await _genai_client.aio.models.generate_content(
                model=_FLASH_MODEL,
                contents=prompt,
            )
            text = (resp.text or "").strip()
            return text if text else None
        except Exception as exc:
            logger.warning(f"[Validator] Summary generation skipped: {exc}")
            return None

    async def _pro_precheck(
        self, rt: RawTender, scraper_agent_id: Optional[int], db: Session
    ) -> str:
        """
        Gemini Pro lightweight check: is this tender likely NEW or a DUPLICATE?
        Returns 'DUPLICATE' or 'NEW'. On any error, returns 'NEW' (fail-open).
        """
        recent_titles = [
            t.Tender_NAME
            for t in db.query(TenderDetails)
            .order_by(TenderDetails.Tender_ID.desc())
            .limit(20)
            .all()
        ]
        recent_block = "\n".join(f"- {t}" for t in recent_titles) if recent_titles else "(none)"

        prompt = (
            f"You are a duplicate-detection agent for government tenders.\n"
            f"Tender title: \"{rt.name}\"\n"
            f"Issuing org: \"{rt.issuing_organisation}\"\n"
            f"Snippet: \"{rt.description[:300]}\"\n\n"
            f"Recently stored tenders in our database:\n{recent_block}\n\n"
            f"Is this tender likely a NEW tender or a DUPLICATE of something recently published?\n"
            f"Reply with exactly one word: NEW or DUPLICATE."
        )
        try:
            response = await _genai_client.aio.models.generate_content(
                model=_PRO_MODEL,
                contents=prompt,
            )
            meta     = getattr(response, "usage_metadata", None)
            input_t  = getattr(meta, "prompt_token_count", 0) or 0
            output_t = getattr(meta, "candidates_token_count", 0) or 0
            self._log_tokens(db, "VALIDATE_FLASH", _PRO_MODEL,
                             input_t, output_t, scraper_agent_id)
            text = response.text.strip().upper()
            return "DUPLICATE" if "DUPLICATE" in text else "NEW"
        except Exception as e:
            logger.warning(f"[Validator] Pro pre-check error (fail-open): {e}")
            return "NEW"

    # ─── [8b] Requirement classifier ──────────────────────────────────────────

    async def _classify_requirements(self, rt: RawTender, db: Session) -> Optional[str]:
        """Ask the classifier what the tender itself requires. Never raises."""
        if (settings.requirements_backend or "off").lower() == "off":
            return None
        try:
            cert_names = [
                c.Certificate_NAME
                for c in db.query(CertificateMaster).order_by(CertificateMaster.Certificate_ID).limit(40).all()
                if c.Certificate_NAME
            ]
            # Laya is synchronous and CPU-bound: keep it off the event loop.
            result = await asyncio.to_thread(
                classify_requirements, rt.name, rt.description, cert_names
            )
            return result.to_json() if result else None
        except Exception as e:
            logger.warning(f"[Validator] Requirement classifier skipped: {e}")
            return None

    # ─── [2] Fingerprint Check ────────────────────────────────────────────────

    def _fingerprint_exists(self, rt: RawTender, db: Session) -> bool:
        """
        Composite key check in MySQL:
        Issuing_Organisation + Tender_Ref_Number + Deadline.
        Only runs when tender_ref_number is available (not null).
        """
        if not rt.tender_ref_number or not rt.deadline:
            return False
        exists = db.query(TenderDetails).filter(
            TenderDetails.Issuing_Organisation == rt.issuing_organisation,
            TenderDetails.Tender_Ref_Number    == rt.tender_ref_number,
            TenderDetails.Deadline             == rt.deadline,
        ).first()
        return exists is not None

    # ─── [6] PRE_FILTER second pass ───────────────────────────────────────────

    def _run_pre_filters(self, rt: RawTender, dept_ids: list, db: Session) -> Optional[str]:
        """Re-run PRE_FILTER at validator level (per-dept OR scoping)."""
        if not dept_ids:
            return None
        rules = db.query(ParticipationCriteriaMaster).filter(
            ParticipationCriteriaMaster.Department_ID.in_(dept_ids),
            ParticipationCriteriaMaster.Criteria_Type == "PRE_FILTER",
            ParticipationCriteriaMaster.Is_Active == True,
        ).all()
        return dept_rules_pass(
            rules, dept_ids,
            lambda tender, field: self._resolve_field(tender, field, db),
            rt,
            use_action=True,
        )

    # ─── Helpers ──────────────────────────────────────────────────────────────

    def _resolve_field(self, rt: RawTender, field: str, db: Session):
        from core.criteria_fields import normalize_pre_field

        actual_field = normalize_pre_field(field)

        if actual_field == "sector":
            from core.models import SectorMaster, KeywordMaster as _KM
            sector_votes = {}
            if rt.keywords:
                kw_lower = [k.lower() for k in rt.keywords]
                kw_records = db.query(_KM).all()
                for kw_rec in kw_records:
                    if kw_rec.Keyword.lower() in kw_lower:
                        sid = kw_rec.Sector_ID
                        sector_votes[sid] = sector_votes.get(sid, 0) + 1
            if not sector_votes:
                text = f"{rt.name} {rt.description}".lower()
                sectors = db.query(SectorMaster).filter_by(Is_Active=True).all()
                for s in sectors:
                    if s.Sector_Name.lower() in text:
                        sector_votes[s.Sector_ID] = sector_votes.get(s.Sector_ID, 0) + 2

            if sector_votes:
                best_sid = max(sector_votes, key=sector_votes.get)
            else:
                fallback = db.query(SectorMaster).filter_by(Is_Active=True).first()
                best_sid = fallback.Sector_ID if fallback else 1

            sector_rec = db.query(SectorMaster).filter_by(Sector_ID=best_sid).first()
            return sector_rec.Sector_Name if sector_rec else None

        return resolve_pre_filter_value(rt, actual_field)

    def _resolve_sector(self, db: Session, keywords: list = None, name: str = "", description: str = "") -> int:
        """
        Infer the most relevant Sector_ID from the tender's keywords/title/description.
        Strategy:
          1. For each keyword in the extracted list, look up KeywordMaster → get Sector_ID
          2. Pick the most frequently matched sector
          3. Fall back to fuzzy text match against Sector_Name in tender title/description
          4. Final fallback: first active sector
        """
        from core.models import KeywordMaster as _KM
        sector_votes: dict = {}

        # Step 1: exact keyword → sector lookup
        if keywords:
            kw_lower = [k.lower() for k in keywords]
            kw_records = db.query(_KM).all()
            for kw_rec in kw_records:
                if kw_rec.Keyword.lower() in kw_lower:
                    sector_id = kw_rec.Sector_ID
                    sector_votes[sector_id] = sector_votes.get(sector_id, 0) + 1

        # Step 2: match sector names and keyword tokens in title/description
        tender_text = f"{name} {description}".lower()
        title_lower = name.lower()
        sectors = db.query(SectorMaster).filter_by(Is_Active=True).all()
        for s in sectors:
            sname = s.Sector_Name.lower()
            if sname in tender_text:
                weight = 3 if sname in title_lower else 2
                sector_votes[s.Sector_ID] = sector_votes.get(s.Sector_ID, 0) + weight
            for token in sname.split():
                if len(token) > 3 and token in tender_text:
                    sector_votes[s.Sector_ID] = sector_votes.get(s.Sector_ID, 0) + 1

        if sector_votes:
            best = max(sector_votes, key=sector_votes.get)
            logger.info(f"[Validator] Resolved sector_id={best} (votes={sector_votes})")
            return best

        # Step 3: absolute fallback - first active sector
        fallback = db.query(SectorMaster).filter_by(Is_Active=True).first()
        logger.warning("[Validator] Could not infer sector - using fallback sector_id")
        return fallback.Sector_ID if fallback else 1

    def _log(
        self, db: Session,
        event_type: str,
        tender_id: Optional[int],
        dept_id: Optional[int],
        scraper_agent_id: Optional[int] = None,
        status: str = "SUCCESS",
        detail: Optional[dict] = None,
    ):
        try:
            db.add(ActivityLog(
                Event_Type=event_type,
                Tender_ID=tender_id,
                Department_ID=dept_id,
                Scraper_Agent_ID=scraper_agent_id,
                Status=status,
                Details_JSON=json.dumps(detail or {}),
            ))
            db.commit()
        except Exception as e:
            logger.warning(f"[Validator] ActivityLog write failed: {e}")

    def _log_tokens(
        self, db: Session, stage: str, model: str,
        input_t: int, output_t: int, scraper_agent_id: Optional[int],
        tender_id: Optional[int] = None,
    ):
        try:
            db.add(AITokenUsageLog(
                Stage=stage,
                Model=model,
                Input_Tokens=input_t,
                Output_Tokens=output_t,
                Estimated_Cost_USD=_calc_cost(input_t, output_t, model),
                Scraper_Agent_ID=scraper_agent_id,
                Tender_ID=tender_id,
            ))
            db.commit()
        except Exception as e:
            logger.warning(f"[Validator] Token log write failed: {e}")
