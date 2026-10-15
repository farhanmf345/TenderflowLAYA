import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from core.database import get_db
from core import models
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone

router = APIRouter()
logger = logging.getLogger(__name__)

class TenderOut(BaseModel):
    Tender_ID: int
    Tender_NAME: str
    Issuing_Organisation: str
    Sector_ID: int
    Deadline: datetime
    Score: float
    Indexed: bool
    Source_Domain: str
    Created_On: datetime
    Tender_Status: Optional[str] = None
    class Config: from_attributes = True


class DeptQualOut(BaseModel):
    result_id: int
    dept_id: int
    dept_name: str
    sector: Optional[str] = None
    score: float
    verdict: str
    dims: list
    gaps: list
    strengths: list
    recommendations: list
    subject_fails: list
    reasoning: str
    quote: str


class TenderBrowserOut(BaseModel):
    tender_id: int
    name: str
    org: Optional[str] = None
    deadline: Optional[datetime] = None
    clarification_date: Optional[datetime] = None
    query_deadline: Optional[datetime] = None
    final_deadline: Optional[datetime] = None
    portal: Optional[str] = None
    signal: Optional[float] = None
    summary: Optional[str] = None
    participation_status: Optional[str] = None
    tender_status: Optional[str] = None
    # Classifier output (what the tender itself requires); None if not run
    requirements: Optional[dict] = None
    # Best result across all dept qualifications
    best_score: float
    best_verdict: str
    # All per-department qualifications
    qualifications: List[DeptQualOut]


def _parse_requirements(raw: Optional[str]) -> Optional[dict]:
    """Stored classifier output with probabilities -> UI-friendly dict."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        return None
    from config.settings import settings
    t = settings.requirements_confidence
    return {
        "backend": data.get("backend"),
        "threshold": t,
        "flags": [k for k, p in (data.get("flags") or {}).items() if p >= t],
        "required_certificates": [k for k, p in (data.get("certificates") or {}).items() if p >= t],
        "raw": data,
    }


class StatusUpdate(BaseModel):
    status: str  # NOT_PARTICIPATED | PARTICIPATED | WON | LAPSED


@router.get("/", response_model=List[TenderOut])
def list_tenders(
    sector_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.TenderDetails)
    if sector_id:
        q = q.filter(models.TenderDetails.Sector_ID == sector_id)
    if search:
        q = q.filter(models.TenderDetails.Tender_NAME.ilike(f"%{search}%"))
    return q.order_by(models.TenderDetails.Created_On.desc()).all()


@router.get("/browser", response_model=List[TenderBrowserOut])
def get_tender_browser(
    dept_id: Optional[int] = None,
    status: Optional[str] = None,   # active | lapsed | participated | won
    db: Session = Depends(get_db)
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    q = db.query(
        models.QualificationResult,
        models.TenderDetails,
        models.DepartmentMaster
    ).join(
        models.TenderDetails, models.QualificationResult.Tender_ID == models.TenderDetails.Tender_ID
    ).join(
        models.DepartmentMaster, models.QualificationResult.Department_ID == models.DepartmentMaster.Department_ID
    ).options(
        selectinload(models.DepartmentMaster.sector),
    )
    if dept_id:
        q = q.filter(models.QualificationResult.Department_ID == dept_id)
    # Status filter
    if status == 'active':
        q = q.filter(models.TenderDetails.Deadline >= now)
    elif status == 'lapsed':
        q = q.filter(models.TenderDetails.Deadline < now)
    elif status == 'participated':
        q = q.filter(models.TenderDetails.Participation_Status == 'PARTICIPATED')
    elif status == 'won':
        q = q.filter(models.TenderDetails.Participation_Status == 'WON')
    results = q.order_by(models.TenderDetails.Created_On.desc()).all()

    # Group by tender_id
    tender_map: dict = {}
    for qual, tender, dept in results:
        tid = tender.Tender_ID

        # Parse dims
        try:
            dims_raw = json.loads(qual.Dimensions_JSON)
            dims = [{"name": d.get("name"), "score": d.get("earned_points", 0), "max": d.get("max_points", 0), "notes": d.get("notes", "")} for d in dims_raw]
        except Exception:
            dims = []

        try:
            gaps_list = json.loads(qual.Gaps_JSON)
            gaps = gaps_list if isinstance(gaps_list, list) else [str(gaps_list)]
        except Exception:
            gaps = [qual.Gaps_JSON or ""]

        try:
            strengths_list = json.loads(qual.Strengths_JSON)
            strengths = strengths_list if isinstance(strengths_list, list) else [str(strengths_list)]
        except Exception:
            strengths = [qual.Strengths_JSON or ""]

        try:
            recs_list = json.loads(qual.Recommendations_JSON)
            recommendations = recs_list if isinstance(recs_list, list) else [str(recs_list)]
        except Exception:
            recommendations = [qual.Recommendations_JSON or ""]

        try:
            dq_list = json.loads(qual.Hard_Disqualifiers_JSON)
            subject_fails = [d for d in dq_list if d.startswith("[SUBJECT FAIL]")]
            subject_fails = [d.replace("[SUBJECT FAIL] ", "") for d in subject_fails]
        except Exception:
            subject_fails = []

        reasoning = qual.Reasoning or ""

        dept_qual = DeptQualOut(
            result_id=qual.Result_ID,
            dept_id=dept.Department_ID,
            dept_name=dept.Department_Name,
            sector=dept.sector.Sector_Name if dept.sector else "",
            score=qual.Score,
            verdict=qual.Verdict,
            dims=dims,
            gaps=gaps,
            strengths=strengths,
            recommendations=recommendations,
            subject_fails=subject_fails,
            reasoning=reasoning,
            quote=tender.Description or "",
        )

        if tid not in tender_map:
            tender_map[tid] = {
                "tender": tender,
                "qualifications": [],
            }
        tender_map[tid]["qualifications"].append(dept_qual)

    out = []
    for tid, entry in tender_map.items():
        tender = entry["tender"]
        quals = entry["qualifications"]
        # Best = highest score
        best = max(quals, key=lambda q: q.score)
        out.append(TenderBrowserOut(
            tender_id=tid,
            name=tender.Tender_NAME,
            org=tender.Issuing_Organisation,
            deadline=tender.Deadline,
            clarification_date=tender.Clarification_Meeting_Date,
            query_deadline=tender.Query_Submission_Deadline,
            final_deadline=tender.Final_Submission_Deadline,
            portal=tender.Source_Domain,
            signal=tender.Score,
            summary=tender.Tender_Summary,
            participation_status=tender.Participation_Status,
            tender_status=tender.Tender_Status,
            requirements=_parse_requirements(tender.Requirements_JSON),
            best_score=best.score,
            best_verdict=best.verdict,
            qualifications=quals,
        ))
    return out


@router.patch("/{tender_id}/status")
def update_tender_status(
    tender_id: int,
    payload: StatusUpdate,
    db: Session = Depends(get_db)
):
    """Admin endpoint: mark a tender's participation status."""
    tender = db.query(models.TenderDetails).filter_by(Tender_ID=tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    allowed = {'NOT_PARTICIPATED', 'PARTICIPATED', 'WON', 'LAPSED'}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"status must be one of {allowed}")
    tender.Participation_Status = payload.status
    db.commit()
    return {"tender_id": tender_id, "participation_status": payload.status}


class LayaCompareRequest(BaseModel):
    department_id: int


@router.post("/{tender_id}/compare-laya")
async def compare_saved_score_with_laya(
    tender_id: int,
    payload: LayaCompareRequest,
    db: Session = Depends(get_db),
):
    """Preview a fresh Laya score beside the saved score without replacing it or sending email."""
    from agents.qualifier_agent import QualifierAgent
    from core.models import (
        CompanyMaster, DepartmentProjectMapping, ProfileEquipmentMapping,
        ProfileStateMapping, DepartmentTenderHistory, DepartmentKeywordMapping,
        KeywordMaster, CompanyCertificateMapping, CertificateMaster,
    )
    from fastapi import HTTPException

    tender = db.query(models.TenderDetails).filter_by(Tender_ID=tender_id).first()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    dept = db.query(models.DepartmentMaster).filter_by(Department_ID=payload.department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    company = db.query(CompanyMaster).first()
    if not company:
        raise HTTPException(status_code=400, detail="No company profile is configured")

    saved = db.query(models.QualificationResult).filter_by(
        Tender_ID=tender_id, Department_ID=payload.department_id
    ).order_by(models.QualificationResult.Evaluated_At.desc()).first()
    if not saved:
        raise HTTPException(status_code=404, detail="No saved score exists for this tender and department")

    projects = db.query(DepartmentProjectMapping).filter_by(Department_ID=payload.department_id).all()
    equipment = db.query(ProfileEquipmentMapping).filter_by(Company_ID=company.Company_ID).all()
    states = db.query(ProfileStateMapping).filter_by(Company_ID=company.Company_ID).all()
    history = db.query(DepartmentTenderHistory).filter_by(Department_ID=payload.department_id).all()
    kw_ids = [m.Keyword_ID for m in db.query(DepartmentKeywordMapping).filter_by(Department_ID=payload.department_id).all()]
    keywords = [kw.Keyword.lower() for kw in db.query(KeywordMaster).filter(KeywordMaster.Keyword_ID.in_(kw_ids)).all()] if kw_ids else []

    held_cert_ids = {
        m.Certificate_ID for m in db.query(CompanyCertificateMapping).filter_by(Company_ID=company.Company_ID).all()
    }
    held_certs = [c.Certificate_NAME for c in db.query(CertificateMaster).filter(
        CertificateMaster.Certificate_ID.in_(held_cert_ids)
    ).all() if c.Certificate_NAME] if held_cert_ids else []

    # This endpoint intentionally does not call qualify()/_save_result(): comparison
    # must not overwrite the historical score or trigger qualification emails.
    agent = QualifierAgent()
    try:
        new_verdict = await agent._qualify(
            company=company, dept=dept, tender=tender,
            projects=projects, equipment=equipment, states=states,
            tender_history=history, dept_keywords=keywords, db=db, force_laya=True,
        )
        if not getattr(agent, "_last_laya_scoring_used", False):
            raise HTTPException(status_code=502, detail="Laya scoring failed; the existing score was preserved and no fallback score was presented as Laya.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Laya comparison failed for tender %s", tender_id)
        raise HTTPException(status_code=502, detail=f"Laya comparison failed: {type(exc).__name__}: {exc}")

    try:
        old_dims_raw = json.loads(saved.Dimensions_JSON or "[]")
        old_dims = [{
            "name": d.get("name", "Unknown"),
            "score": d.get("earned_points", d.get("score", 0)),
            "max": d.get("max_points", d.get("max", 0)),
            "notes": d.get("notes", ""),
        } for d in old_dims_raw]
    except Exception:
        old_dims = []

    new_dims = [{
        "name": d.name, "score": d.earned_points, "max": d.max_points, "notes": d.notes,
    } for d in new_verdict.dimensions]
    return {
        "tender_id": tender_id,
        "tender_name": tender.Tender_NAME,
        "department_id": payload.department_id,
        "department_name": dept.Department_Name,
        "saved_score": {
            "score": saved.Score, "verdict": saved.Verdict,
            "evaluated_at": saved.Evaluated_At.isoformat() if saved.Evaluated_At else None,
            "dimensions": old_dims,
            "reasoning": saved.Reasoning or "",
        },
        "laya_score": {
            "score": new_verdict.qualification_score, "verdict": new_verdict.verdict,
            "dimensions": new_dims, "reasoning": new_verdict.reasoning,
            "strengths": new_verdict.strengths, "gaps": new_verdict.gaps,
            "recommendations": new_verdict.recommendations,
            "hard_disqualifiers": new_verdict.hard_disqualifiers,
            "subject_fails": new_verdict.subject_fails,
        },
        "score_delta": round(new_verdict.qualification_score - float(saved.Score), 2),
        "saved_result_preserved": True,
    }
