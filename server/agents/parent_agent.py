"""
Parent Agent - TenderFlow v4.0

Orchestrates the full pipeline per ScraperAgentMaster entry:
  1. Enforce global concurrency limit (CompanyMaster.Max_Concurrent_Scrapes)
  2. Create a BaseScraper instance via factory and run scrape()
  3. Pass each RawTender to ValidatorAgent for dedup + validation + storage
  4. Fire QualifierAgent for each stored tender × linked department
  5. Log pipeline run to ActivityLog with Scraper_Agent_ID

QUAL_GATE and email suppression are handled by the Qualifier Agent (separate dev).
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from core.database import SessionLocal
from core.models import (
    ScraperAgentMaster, CompanyMaster, ActivityLog,
    DepartmentPortalMapping, DepartmentMaster,
    DepartmentProjectMapping, ProfileEquipmentMapping,
    ProfileStateMapping, ParticipationCriteriaMaster,
    DepartmentTenderHistory, DepartmentKeywordMapping, KeywordMaster,
)
from agents.ScraperAgents.base_scraper import create_scraper
from agents.validator_agent import ValidatorAgent
from agents.qualifier_agent import QualifierAgent

logger = logging.getLogger(__name__)

# ─── Pipeline Context ────────────────────────────────────────────────────────
# Holds prefetched data to avoid redundant DB queries during qualification.

class PipelineContext:
    def __init__(self, db: Session, dept_ids: List[int]):
        self.company = db.query(CompanyMaster).first()
        self.depts   = {
            d.Department_ID: d
            for d in db.query(DepartmentMaster).filter(
                DepartmentMaster.Department_ID.in_(dept_ids)
            ).all()
        }

        # Per-department prefetches
        self.projects       = {}
        self.tender_history = {}
        self.dept_keywords  = {}
        for dept_id in dept_ids:
            self.projects[dept_id]       = db.query(DepartmentProjectMapping).filter_by(Department_ID=dept_id).all()
            self.tender_history[dept_id] = db.query(DepartmentTenderHistory).filter_by(Department_ID=dept_id).all()
            kw_ids = [
                m.Keyword_ID for m in
                db.query(DepartmentKeywordMapping).filter_by(Department_ID=dept_id).all()
            ]
            self.dept_keywords[dept_id] = [
                kw.Keyword.lower() for kw in
                db.query(KeywordMaster).filter(KeywordMaster.Keyword_ID.in_(kw_ids)).all()
            ]

        if self.company:
            self.equipment = db.query(ProfileEquipmentMapping).filter_by(Company_ID=self.company.Company_ID).all()
            self.states    = db.query(ProfileStateMapping).filter_by(Company_ID=self.company.Company_ID).all()
        else:
            self.equipment = []
            self.states    = []

        # Prefetch participation criteria per department (QUAL_GATE + PRE_FILTER)
        self.gates = {dept_id: [] for dept_id in dept_ids}
        for g in db.query(ParticipationCriteriaMaster).filter(
            ParticipationCriteriaMaster.Department_ID.in_(dept_ids)
        ).all():
            self.gates.setdefault(g.Department_ID, []).append(g)


# ─── Global asyncio semaphore ─────────────────────────────────────────────────
_semaphore: Optional[asyncio.Semaphore] = None
_semaphore_limit: int = 0


def _get_semaphore(limit: int) -> asyncio.Semaphore:
    global _semaphore, _semaphore_limit
    if _semaphore is None or _semaphore_limit != limit:
        _semaphore       = asyncio.Semaphore(limit)
        _semaphore_limit = limit
    return _semaphore


class ParentAgent:
    """Orchestrates the TenderFlow pipeline for one ScraperAgent ID."""

    def __init__(self):
        self.validator = ValidatorAgent()
        self.qualifier = QualifierAgent()

    async def run(self, scraper_agent_id: int):
        # ── Fetch concurrency limit with a short-lived session
        with SessionLocal() as _db:
            company = _db.query(CompanyMaster).first()
            limit   = company.Max_Concurrent_Scrapes if company else 2

        sem = _get_semaphore(limit)
        async with sem:
            db: Session = SessionLocal()
            try:
                await self._run_pipeline(scraper_agent_id, db)
            except Exception as e:
                logger.error(f"[ParentAgent] Unhandled error for agent {scraper_agent_id}: {e}", exc_info=True)
                self._log(db, "SCRAPE_RUN_ENDED", None, None,
                          scraper_agent_id=scraper_agent_id,
                          status="FAILED",
                          detail={"error": str(e)})
            finally:
                db.close()

    async def _run_pipeline(self, scraper_agent_id: int, db: Session):
        # 1. Load agent record
        agent_record = db.query(ScraperAgentMaster).filter_by(
            ScraperAgent_ID=scraper_agent_id,
            Is_Active=True,
        ).first()

        if not agent_record:
            logger.warning(f"[ParentAgent] Agent {scraper_agent_id} not found or inactive.")
            return

        portal_name = agent_record.portal.Portal_Name if agent_record.portal else "Unknown"
        logger.info(f"[ParentAgent] ▶ Pipeline start - Agent #{scraper_agent_id} ({portal_name})")

        self._log(db, "SCRAPE_RUN_STARTED", None, None,
                  scraper_agent_id=scraper_agent_id,
                  status="SUCCESS",
                  detail={"portal": portal_name, "message": "Pipeline started"})

        # 2. Linked departments for this portal
        dept_ids = [
            m.Department_ID
            for m in db.query(DepartmentPortalMapping).filter_by(
                Portal_ID=agent_record.Portal_ID
            ).all()
        ]

        # 3. PREFETCH CONTEXT - Avoid hundreds of redundant queries
        logger.info(f"[ParentAgent] Prefetching context for {len(dept_ids)} departments...")
        ctx = PipelineContext(db, dept_ids)

        # 4. Create BaseScraper via factory and scrape
        scraper     = create_scraper(scraper_agent_id, db)
        raw_tenders = await scraper.scrape()
        logger.info(f"[ParentAgent] {len(raw_tenders)} tenders scraped from {portal_name}")

        # 5. Validate + store each tender
        start_time = datetime.now()
        stored_ids = []
        discarded  = 0

        for rt in raw_tenders:
            tender_id = await self.validator.validate(
                raw_tender=rt,
                portal_id=agent_record.Portal_ID,
                scraper_agent_id=scraper_agent_id,
                db=db,
            )
            if tender_id:
                stored_ids.append(tender_id)
            else:
                discarded += 1

        # 6. Qualify stored tenders - only against sector-matched departments
        from core.models import TenderDetails as _TD
        qualified_pairs: set = set()   # guard against duplicate (tender_id, dept_id) calls

        for tender_id in stored_ids:
            stored_tender    = db.query(_TD).filter_by(Tender_ID=tender_id).first()
            tender_sector_id = stored_tender.Sector_ID if stored_tender else None

            for dept_id in dept_ids:
                # Dedup guard
                if (tender_id, dept_id) in qualified_pairs:
                    logger.info(f"[ParentAgent] Skipping duplicate pair tender={tender_id} dept={dept_id}")
                    continue

                dept = ctx.depts.get(dept_id)
                if not dept:
                    continue

                if tender_sector_id is not None and dept.Sector_ID != tender_sector_id:
                    logger.info(f"[ParentAgent] Skipping dept={dept_id} sector mismatch")
                    continue

                qualified_pairs.add((tender_id, dept_id))
                try:
                    await self.qualifier.qualify(
                        tender_id=tender_id,
                        department_id=dept_id,
                        db=db,
                        context=ctx,
                    )
                except Exception as e:
                    logger.error(f"[ParentAgent] Qualifier failed tender={tender_id} dept={dept_id}: {e}")

        # 7. Log run end
        duration = int((datetime.now() - start_time).total_seconds())
        dept_names = [d.Department_Name for d in ctx.depts.values() if d]
        self._log(db, "SCRAPE_RUN_ENDED", None, None,
                  scraper_agent_id=scraper_agent_id,
                  status="SUCCESS" if len(stored_ids) > 0 else "WARNING",
                  detail={
                      "portal":            portal_name,
                      "departments":       dept_names,
                      "tenders_found":     len(raw_tenders),
                      "tenders_stored":    len(stored_ids),
                      "tenders_discarded": discarded,
                      "duration_sec":      duration,
                  })

        logger.info(f"[ParentAgent] ✓ Done - {len(stored_ids)} stored, {discarded} discarded | {duration}s")

    def _log(self, db: Session, event_type: str, tender_id: Optional[int], dept_id: Optional[int],
             scraper_agent_id: Optional[int] = None, status: str = "SUCCESS", detail: Optional[dict] = None):
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
            logger.warning(f"[ParentAgent] ActivityLog write failed: {e}")
