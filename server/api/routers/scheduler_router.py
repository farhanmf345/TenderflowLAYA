from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import desc
from pydantic import BaseModel
from core.database import get_db
from core import models
from core.scheduler import reload_jobs
from typing import Optional
import asyncio
import json


class GlobalParams(BaseModel):
    Max_Concurrent: Optional[int] = None
    Scrape_Gap_Sec: Optional[float] = None
    Max_Retries: Optional[int] = None
    Retry_Interval_Sec: Optional[float] = None
    ChromaDB_Dedup_Threshold: Optional[float] = None

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _is_agent_running(agent_id: int, db: Session) -> bool:
    """True when SCRAPE_RUN_STARTED has no matching SCRAPE_RUN_ENDED after it."""
    started = (
        db.query(models.ActivityLog)
        .filter(
            models.ActivityLog.Scraper_Agent_ID == agent_id,
            models.ActivityLog.Event_Type == "SCRAPE_RUN_STARTED",
        )
        .order_by(desc(models.ActivityLog.Timestamp))
        .first()
    )
    if not started or not started.Timestamp:
        return False
    ended = (
        db.query(models.ActivityLog)
        .filter(
            models.ActivityLog.Scraper_Agent_ID == agent_id,
            models.ActivityLog.Event_Type == "SCRAPE_RUN_ENDED",
            models.ActivityLog.Timestamp >= started.Timestamp,
        )
        .first()
    )
    return ended is None


def _agent_detail(a: models.ScraperAgentMaster, db: Session = None):
    """Serialize a ScraperAgentMaster row into the rich dict the frontend needs."""
    # Linked departments (via DepartmentPortalMapping)
    portal = a.portal
    depts = []
    keywords = []
    if portal:
        dpm_rows = portal.dept_mapping  # list[DepartmentPortalMapping]
        for dpm in dpm_rows:
            dept = dpm.department
            if dept:
                depts.append({"id": dept.Department_ID, "name": dept.Department_Name})
                for dkm in dept.keyword_mapping:
                    kw = dkm.keyword
                    if kw and kw.Keyword not in keywords:
                        keywords.append(kw.Keyword)

    # Parse Freq_Config_JSON safely
    try:
        freq_config = json.loads(a.Freq_Config_JSON) if a.Freq_Config_JSON else {}
    except Exception:
        freq_config = {}

    # Last run + tenders_count from ActivityLog
    last_run = None
    tenders_count = None
    if db:
        last_log = (
            db.query(models.ActivityLog)
            .filter(
                models.ActivityLog.Scraper_Agent_ID == a.ScraperAgent_ID,
                models.ActivityLog.Event_Type == "SCRAPE_RUN_ENDED",
            )
            .order_by(models.ActivityLog.Timestamp.desc())
            .first()
        )
        if last_log:
            last_run = last_log.Timestamp.isoformat() if last_log.Timestamp else None
            try:
                details = json.loads(last_log.Details_JSON)
                tenders_count = details.get("tenders_stored", 0)
            except Exception:
                tenders_count = 0

    # Next run from APScheduler
    next_run = None
    try:
        from core.scheduler import get_scheduler
        sched = get_scheduler()
        job = sched.get_job(f"scraper_agent_{a.ScraperAgent_ID}")
        if job and job.next_run_time:
            next_run = job.next_run_time.isoformat()
    except Exception:
        pass

    return {
        "id":            a.ScraperAgent_ID,
        "portal_id":     a.Portal_ID,
        "portal":        portal.Base_URL if portal else "unknown",
        "portal_name":   portal.Portal_Name if portal else "Unknown",
        "status":        (
            "running" if db and _is_agent_running(a.ScraperAgent_ID, db)
            else ("active" if a.Is_Active else "inactive")
        ),
        "is_active":     a.Is_Active,
        "freq_id":       a.Freq_ID,
        "freq_type":     a.frequency.Freq_Type if a.frequency else "custom",
        "freq_config":   freq_config,
        "departments":   depts,
        "keywords":      keywords,
        "last_run":      last_run,
        "next_run":      next_run,
        "tenders_count": tenders_count,
        # Scraper params now come from CompanyMaster /api/scheduler/globals
    }


def _load_opts():
    return [
        selectinload(models.ScraperAgentMaster.portal)
            .selectinload(models.WhitelistPortalMaster.dept_mapping)
            .selectinload(models.DepartmentPortalMapping.department)
            .selectinload(models.DepartmentMaster.keyword_mapping)
            .selectinload(models.DepartmentKeywordMapping.keyword),
        selectinload(models.ScraperAgentMaster.frequency),
    ]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/agents")
def list_scheduler_agents(db: Session = Depends(get_db)):
    """Return all scraper agents enriched with departments + keywords."""
    agents = db.query(models.ScraperAgentMaster).options(*_load_opts()).all()
    return [_agent_detail(a, db) for a in agents]


@router.get("/status")
def get_scheduler_status(db: Session = Depends(get_db)):
    """Legacy endpoint - returns configured state of all scraper agents."""
    agents = db.query(models.ScraperAgentMaster).options(*_load_opts()).all()
    return [_agent_detail(a, db) for a in agents]


@router.get("/run-log")
def get_run_log(
    limit: int = 50,
    event_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return recent pipeline run log entries from ActivityLog.
    
    Defaults to SCRAPE_RUN_ENDED events only, which are the summary rows
    that contain portal, duration, tenders_found, and tenders_stored.
    Pass event_type=ALL to get every event type.
    """
    q = (
        db.query(models.ActivityLog)
        .options(
            selectinload(models.ActivityLog.tender),
            selectinload(models.ActivityLog.department),
        )
    )
    # Default to summary rows only; pass event_type=ALL to bypass
    if event_type and event_type != "ALL":
        q = q.filter(models.ActivityLog.Event_Type == event_type)
    elif not event_type:
        q = q.filter(models.ActivityLog.Event_Type == "SCRAPE_RUN_ENDED")
    if status:
        q = q.filter(models.ActivityLog.Status == status)

    logs = q.order_by(desc(models.ActivityLog.Timestamp)).limit(limit).all()

    results = []
    for log in logs:
        # Parse details for duration / found / stored fields
        try:
            details = json.loads(log.Details_JSON)
        except Exception:
            details = {}

        results.append({
            "log_id":       log.Log_ID,
            "event_type":   log.Event_Type,
            "tender_id":    log.Tender_ID,
            "department":   ", ".join(details.get("departments", [])) or (log.department.Department_Name if log.department else None),
            "department_id": log.Department_ID,
            "status":       log.Status,
            "timestamp":    log.Timestamp.isoformat() if log.Timestamp else None,
            "duration_sec": details.get("duration_sec"),
            "tenders_found":  details.get("tenders_found"),
            "tenders_stored": details.get("tenders_stored"),
            "portal":       details.get("portal"),
            "agent_id":     details.get("agent_id"),
            "details":      details,
        })
    return results


@router.get("/frequencies")
def list_frequencies(db: Session = Depends(get_db)):
    """List all frequency types."""
    rows = db.query(models.FrequencyMaster).all()
    return [{"Freq_ID": r.Freq_ID, "Freq_Type": r.Freq_Type} for r in rows]


@router.get("/globals")
def get_global_params(db: Session = Depends(get_db)):
    """
    Return global scraper parameters stored in CompanyMaster.
    Falls back to defaults if no company record exists yet.
    """
    company = db.query(models.CompanyMaster).first()
    if company:
        return {
            "Max_Concurrent":            company.Max_Concurrent_Scrapes,
            "Scrape_Gap_Sec":            company.Scrape_Gap_Sec,
            "Max_Retries":               company.Max_Retries,
            "Retry_Interval_Sec":        company.Retry_Interval_Sec,
            "ChromaDB_Dedup_Threshold":  getattr(company, 'ChromaDB_Dedup_Threshold', 0.96),
        }
    return {
        "Max_Concurrent":            2,
        "Scrape_Gap_Sec":            10.0,
        "Max_Retries":               2,
        "Retry_Interval_Sec":        60.0,
        "ChromaDB_Dedup_Threshold":  0.96,
    }


@router.put("/globals")
def update_global_params(payload: GlobalParams, db: Session = Depends(get_db)):
    """
    Persist global scraper parameters to CompanyMaster.
    Frontend calls this from Scraper Config > Global Parameters section.
    """
    company = db.query(models.CompanyMaster).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company profile not found. Create it first.")
    updates = payload.model_dump(exclude_none=True)
    field_map = {
        "Max_Concurrent":           "Max_Concurrent_Scrapes",
        "Scrape_Gap_Sec":           "Scrape_Gap_Sec",
        "Max_Retries":              "Max_Retries",
        "Retry_Interval_Sec":       "Retry_Interval_Sec",
        "ChromaDB_Dedup_Threshold": "ChromaDB_Dedup_Threshold",
    }
    for payload_key, model_key in field_map.items():
        if payload_key in updates:
            setattr(company, model_key, updates[payload_key])
    db.commit()
    return {"detail": "Global scraper parameters updated in CompanyMaster."}



@router.post("/trigger/{agent_id}")
async def trigger_agent(
    agent_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Manually trigger a full pipeline run for a ScraperAgent."""
    agent = db.query(models.ScraperAgentMaster).filter_by(
        ScraperAgent_ID=agent_id
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Scraper agent not found.")

    async def _run():
        from agents.parent_agent import ParentAgent
        pa = ParentAgent()
        await pa.run(scraper_agent_id=agent_id)

    background_tasks.add_task(_run)
    portal_name = agent.portal.Portal_Name if agent.portal else "Unknown"
    return {
        "detail": f"Pipeline triggered for Agent #{agent_id} ({portal_name}). "
                  "Check Activity Log for progress."
    }


@router.post("/pause/{agent_id}")
def pause_agent(agent_id: int, db: Session = Depends(get_db)):
    """Deactivate a scraper agent and remove its scheduled job."""
    agent = db.query(models.ScraperAgentMaster).filter_by(
        ScraperAgent_ID=agent_id
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Scraper agent not found.")

    agent.Is_Active = False
    db.commit()

    from core.scheduler import get_scheduler
    sched = get_scheduler()
    job_id = f"scraper_agent_{agent_id}"
    if sched.get_job(job_id):
        sched.remove_job(job_id)

    return {"detail": f"Agent #{agent_id} deactivated and job removed from scheduler."}


@router.post("/activate/{agent_id}")
def activate_agent(agent_id: int, db: Session = Depends(get_db)):
    """Activate a scraper agent and register its scheduled job."""
    agent = db.query(models.ScraperAgentMaster).filter_by(
        ScraperAgent_ID=agent_id
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Scraper agent not found.")

    agent.Is_Active = True
    db.commit()
    reload_jobs()

    return {"detail": f"Agent #{agent_id} activated and job registered in scheduler."}


@router.post("/reload-jobs")
def reload_all_jobs():
    """Force-reload all scheduler jobs from DB."""
    reload_jobs()
    return {"detail": "Scheduler jobs reloaded from database."}
