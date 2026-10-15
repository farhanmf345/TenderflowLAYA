"""
Manager Portal API — TenderFlow v4.0
Provides endpoints for the Tender Manager Portal (no auth required for now).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import json

from core.database import get_db
from core import models

router = APIRouter()


# ─── Response schemas ─────────────────────────────────────────────────────────

class DeptBrief(BaseModel):
    Department_ID: int
    Department_Name: str
    Sector: Optional[str] = None
    class Config: from_attributes = True


class ManagerWithDepts(BaseModel):
    Head_ID: int
    Head_Name: str
    Email: str
    departments: List[DeptBrief] = []
    class Config: from_attributes = True


class ManagerTenderOut(BaseModel):
    tender_id: int
    tender_name: str
    org: Optional[str] = None
    deadline: Optional[str] = None
    days_remaining: Optional[int] = None
    source_domain: Optional[str] = None
    website_url: Optional[str] = None
    summary: Optional[str] = None
    participation_status: Optional[str] = None
    clarification_date: Optional[str] = None
    query_deadline: Optional[str] = None
    final_deadline: Optional[str] = None
    tender_status: Optional[str] = None
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


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/all", response_model=List[ManagerWithDepts])
def list_managers_with_depts(db: Session = Depends(get_db)):
    """Return all active managers with their linked departments."""
    managers = db.query(models.TenderManagerMaster).filter_by(Is_Active=True).options(
        selectinload(models.TenderManagerMaster.dept_mapping).selectinload(
            models.DepartmentManagerMapping.department
        ).selectinload(models.DepartmentMaster.sector)
    ).all()

    result = []
    for mgr in managers:
        depts = []
        for mapping in mgr.dept_mapping:
            dept = mapping.department
            if dept:
                depts.append(DeptBrief(
                    Department_ID=dept.Department_ID,
                    Department_Name=dept.Department_Name,
                    Sector=dept.sector.Sector_Name if dept.sector else None,
                ))
        result.append(ManagerWithDepts(
            Head_ID=mgr.Head_ID,
            Head_Name=mgr.Head_Name,
            Email=mgr.Email,
            departments=depts,
        ))
    return result


@router.get("/tenders", response_model=List[ManagerTenderOut])
def get_manager_tenders(
    dept_ids: str,           # comma-separated e.g. "2,5"
    verdict: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Return qualified tenders for one or more departments."""
    try:
        id_list = [int(x.strip()) for x in dept_ids.split(",") if x.strip()]
    except ValueError:
        return []

    q = db.query(
        models.QualificationResult,
        models.TenderDetails,
        models.DepartmentMaster,
    ).join(
        models.TenderDetails,
        models.QualificationResult.Tender_ID == models.TenderDetails.Tender_ID,
    ).join(
        models.DepartmentMaster,
        models.QualificationResult.Department_ID == models.DepartmentMaster.Department_ID,
    ).filter(
        models.QualificationResult.Department_ID.in_(id_list)
    )

    if verdict:
        q = q.filter(models.QualificationResult.Verdict == verdict.upper())

    results = q.order_by(models.QualificationResult.Score.desc()).all()

    out = []
    for qual, tender, dept in results:
        def _parse_list(raw):
            try:
                v = json.loads(raw)
                return v if isinstance(v, list) else [str(v)]
            except Exception:
                return [raw] if raw else []

        try:
            dims_raw = json.loads(qual.Dimensions_JSON)
            dims = [{"name": d.get("name"), "score": d.get("earned_points", 0),
                     "max": d.get("max_points", 0), "notes": d.get("notes", "")} for d in dims_raw]
        except Exception:
            dims = []

        try:
            dq_list = json.loads(qual.Hard_Disqualifiers_JSON)
            subject_fails = [d.replace("[SUBJECT FAIL] ", "") for d in dq_list if d.startswith("[SUBJECT FAIL]")]
        except Exception:
            subject_fails = []

        def _fmt(dt):
            return dt.strftime("%d %b %Y") if dt else None

        deadline_str = _fmt(tender.Deadline)
        days_rem = None
        if tender.Deadline:
            days_rem = (tender.Deadline - datetime.now()).days

        out.append(ManagerTenderOut(
            tender_id=tender.Tender_ID,
            tender_name=tender.Tender_NAME,
            org=tender.Issuing_Organisation,
            deadline=deadline_str,
            days_remaining=days_rem,
            source_domain=tender.Source_Domain,
            website_url=tender.Website_URL,
            summary=tender.Tender_Summary,
            participation_status=tender.Participation_Status,
            clarification_date=_fmt(tender.Clarification_Meeting_Date),
            query_deadline=_fmt(tender.Query_Submission_Deadline),
            final_deadline=_fmt(tender.Final_Submission_Deadline),
            tender_status=tender.Tender_Status,
            dept_id=dept.Department_ID,
            dept_name=dept.Department_Name,
            sector=dept.sector.Sector_Name if dept.sector else None,
            score=qual.Score,
            verdict=qual.Verdict,
            dims=dims,
            gaps=_parse_list(qual.Gaps_JSON),
            strengths=_parse_list(qual.Strengths_JSON),
            recommendations=_parse_list(qual.Recommendations_JSON),
            subject_fails=subject_fails,
            reasoning=qual.Reasoning or "",
        ))
    return out
