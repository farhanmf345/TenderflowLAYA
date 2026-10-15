from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from core.database import get_db
from core import models
from core.scheduler import reload_jobs
from schemas.scraper_agent import ScraperAgentCreate, ScraperAgentUpdate, ScraperAgentOut
from typing import List
import json

router = APIRouter()


def _load_opts():
    return [
        selectinload(models.ScraperAgentMaster.portal)
            .selectinload(models.WhitelistPortalMaster.dept_mapping)
            .selectinload(models.DepartmentPortalMapping.department)
            .selectinload(models.DepartmentMaster.keyword_mapping)
            .selectinload(models.DepartmentKeywordMapping.keyword),
        selectinload(models.ScraperAgentMaster.frequency),
    ]


def _enrich(a: models.ScraperAgentMaster):
    """Build a rich dict with departments + keywords for this agent."""
    portal = a.portal
    depts, keywords = [], []
    if portal:
        for dpm in portal.dept_mapping:
            dept = dpm.department
            if dept:
                depts.append({"id": dept.Department_ID, "name": dept.Department_Name})
                for dkm in dept.keyword_mapping:
                    kw = dkm.keyword
                    if kw and kw.Keyword not in keywords:
                        keywords.append(kw.Keyword)

    try:
        freq_config = json.loads(a.Freq_Config_JSON) if a.Freq_Config_JSON else {}
    except Exception:
        freq_config = {}

    return {
        "ScraperAgent_ID":  a.ScraperAgent_ID,
        "Portal_ID":        a.Portal_ID,
        "portal_url":       portal.Base_URL if portal else "",
        "portal_name":      portal.Portal_Name if portal else "Unknown",
        "Freq_ID":          a.Freq_ID,
        "freq_type":        a.frequency.Freq_Type if a.frequency else "custom",
        "Freq_Config_JSON": a.Freq_Config_JSON,
        "freq_config":      freq_config,
        "Is_Active":        a.Is_Active,
        "departments":      depts,
        "keywords":         keywords,
    }


@router.get("/")
def list_agents(db: Session = Depends(get_db)):
    agents = db.query(models.ScraperAgentMaster).options(*_load_opts()).all()
    return [_enrich(a) for a in agents]


@router.get("/{agent_id}")
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(models.ScraperAgentMaster).options(*_load_opts()).filter(
        models.ScraperAgentMaster.ScraperAgent_ID == agent_id
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Scraper agent not found.")
    return _enrich(agent)


@router.post("/", status_code=201)
def create_agent(payload: ScraperAgentCreate, db: Session = Depends(get_db)):
    # Concurrency guard: count active agents vs company-wide limit
    company = db.query(models.CompanyMaster).first()
    if company:
        active_count = db.query(models.ScraperAgentMaster).filter_by(Is_Active=True).count()
        if payload.Is_Active and active_count >= company.Max_Concurrent_Scrapes:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot create agent: max concurrent scraping limit "
                    f"({company.Max_Concurrent_Scrapes}) already reached. "
                    "Increase the limit in Scraper Config > Global Parameters, "
                    "or deactivate an existing agent first."
                ),
            )
    agent = models.ScraperAgentMaster(**payload.model_dump())
    db.add(agent)
    db.commit()
    db.refresh(agent)
    agent = db.query(models.ScraperAgentMaster).options(*_load_opts()).filter(
        models.ScraperAgentMaster.ScraperAgent_ID == agent.ScraperAgent_ID
    ).first()
    reload_jobs()
    return _enrich(agent)


@router.put("/{agent_id}")
def update_agent(agent_id: int, payload: ScraperAgentUpdate, db: Session = Depends(get_db)):
    agent = db.query(models.ScraperAgentMaster).filter(
        models.ScraperAgentMaster.ScraperAgent_ID == agent_id
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Scraper agent not found.")

    updates = payload.model_dump(exclude_unset=True)

    # Concurrency guard: if this update is activating the agent, check the limit
    activating = updates.get("Is_Active") is True and not agent.Is_Active
    if activating:
        company = db.query(models.CompanyMaster).first()
        if company:
            active_count = db.query(models.ScraperAgentMaster).filter(
                models.ScraperAgentMaster.Is_Active == True,
                models.ScraperAgentMaster.ScraperAgent_ID != agent_id,
            ).count()
            if active_count >= company.Max_Concurrent_Scrapes:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Cannot activate agent: max concurrent scraping limit "
                        f"({company.Max_Concurrent_Scrapes}) already reached. "
                        "Increase the limit in Scraper Config > Global Parameters, "
                        "or deactivate an existing agent first."
                    ),
                )

    for field, value in updates.items():
        setattr(agent, field, value)
    db.commit()
    agent = db.query(models.ScraperAgentMaster).options(*_load_opts()).filter(
        models.ScraperAgentMaster.ScraperAgent_ID == agent_id
    ).first()
    reload_jobs()
    return _enrich(agent)


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(models.ScraperAgentMaster).filter(
        models.ScraperAgentMaster.ScraperAgent_ID == agent_id
    ).first()
    if agent:
        # Pre-delete child records that have NOT NULL FK references
        db.query(models.ActivityLog).filter(
            models.ActivityLog.Scraper_Agent_ID == agent_id
        ).delete(synchronize_session=False)

        db.query(models.AITokenUsageLog).filter(
            models.AITokenUsageLog.Scraper_Agent_ID == agent_id
        ).delete(synchronize_session=False)

        db.delete(agent)
        db.commit()
        reload_jobs()
