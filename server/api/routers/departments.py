import json
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
import google.genai as genai
from config.settings import settings
from core.database import get_db
from core import models
from schemas.department import (
    DepartmentCreate, DepartmentUpdate, DepartmentOut,
    ProjectCreate, ProjectUpdate, ProjectOut,
    TenderHistoryCreate, TenderHistoryOut,
)
from typing import List

_genai_client = genai.Client(api_key=settings.gemini_api_key)
_FLASH_MODEL = settings.gemini_flash_model

router = APIRouter()


def _load_opts():
    """Reusable eager-load options for dept relationships."""
    return [
        selectinload(models.DepartmentMaster.portal_mapping).selectinload(
            models.DepartmentPortalMapping.portal
        ),
        selectinload(models.DepartmentMaster.keyword_mapping).selectinload(
            models.DepartmentKeywordMapping.keyword
        ),
        selectinload(models.DepartmentMaster.manager_mapping).selectinload(
            models.DepartmentManagerMapping.manager
        ),
        selectinload(models.DepartmentMaster.criteria),
        selectinload(models.DepartmentMaster.project_mapping),
        selectinload(models.DepartmentMaster.tender_history),
    ]


@router.get("/", response_model=List[DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    return db.query(models.DepartmentMaster).options(*_load_opts()).all()


@router.get("/{dept_id}", response_model=DepartmentOut)
def get_department(dept_id: int, db: Session = Depends(get_db)):
    dept = db.query(models.DepartmentMaster).options(*_load_opts()).filter(
        models.DepartmentMaster.Department_ID == dept_id
    ).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")
    return dept


@router.post("/", response_model=DepartmentOut, status_code=201)
def create_department(payload: DepartmentCreate, db: Session = Depends(get_db)):
    dept = models.DepartmentMaster(**payload.model_dump())
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return db.query(models.DepartmentMaster).options(*_load_opts()).filter(
        models.DepartmentMaster.Department_ID == dept.Department_ID
    ).first()


@router.put("/{dept_id}", response_model=DepartmentOut)
def update_department(dept_id: int, payload: DepartmentUpdate, db: Session = Depends(get_db)):
    dept = db.query(models.DepartmentMaster).filter(
        models.DepartmentMaster.Department_ID == dept_id
    ).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)
    db.commit()
    return db.query(models.DepartmentMaster).options(*_load_opts()).filter(
        models.DepartmentMaster.Department_ID == dept_id
    ).first()


@router.delete("/{dept_id}", status_code=204)
def delete_department(dept_id: int, db: Session = Depends(get_db)):
    dept = db.query(models.DepartmentMaster).filter(
        models.DepartmentMaster.Department_ID == dept_id
    ).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found.")

    # Manually delete child records with NOT NULL FK constraints
    db.query(models.QualificationResult).filter(
        models.QualificationResult.Department_ID == dept_id
    ).delete(synchronize_session=False)

    db.query(models.ActivityLog).filter(
        models.ActivityLog.Department_ID == dept_id
    ).delete(synchronize_session=False)

    db.delete(dept)
    db.commit()


# ─── Portal Mapping ───────────────────────────────────────────────────────────

@router.post("/{dept_id}/portals/{portal_id}", status_code=201)
def add_portal(dept_id: int, portal_id: int, db: Session = Depends(get_db)):
    exists = db.query(models.DepartmentPortalMapping).filter_by(
        Department_ID=dept_id, Portal_ID=portal_id
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Portal already mapped.")
    db.add(models.DepartmentPortalMapping(Department_ID=dept_id, Portal_ID=portal_id))
    db.commit()
    return {"detail": "Portal added."}


@router.delete("/{dept_id}/portals/{portal_id}", status_code=204)
def remove_portal(dept_id: int, portal_id: int, db: Session = Depends(get_db)):
    mapping = db.query(models.DepartmentPortalMapping).filter_by(
        Department_ID=dept_id, Portal_ID=portal_id
    ).first()
    if mapping:
        db.delete(mapping)
        db.commit()


# ─── Keyword Mapping ──────────────────────────────────────────────────────────

@router.post("/{dept_id}/keywords/{keyword_id}", status_code=201)
def add_keyword(dept_id: int, keyword_id: int, db: Session = Depends(get_db)):
    exists = db.query(models.DepartmentKeywordMapping).filter_by(
        Department_ID=dept_id, Keyword_ID=keyword_id
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Keyword already mapped.")
    db.add(models.DepartmentKeywordMapping(Department_ID=dept_id, Keyword_ID=keyword_id))
    db.commit()
    return {"detail": "Keyword added."}


@router.delete("/{dept_id}/keywords/{keyword_id}", status_code=204)
def remove_keyword(dept_id: int, keyword_id: int, db: Session = Depends(get_db)):
    mapping = db.query(models.DepartmentKeywordMapping).filter_by(
        Department_ID=dept_id, Keyword_ID=keyword_id
    ).first()
    if mapping:
        db.delete(mapping)
        db.commit()


# ─── Manager Mapping ──────────────────────────────────────────────────────────

@router.post("/{dept_id}/managers/{head_id}", status_code=201)
def add_manager(dept_id: int, head_id: int, db: Session = Depends(get_db)):
    exists = db.query(models.DepartmentManagerMapping).filter_by(
        Department_ID=dept_id, Head_ID=head_id
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Manager already mapped.")
    db.add(models.DepartmentManagerMapping(Department_ID=dept_id, Head_ID=head_id))
    db.commit()
    return {"detail": "Manager added."}


@router.delete("/{dept_id}/managers/{head_id}", status_code=204)
def remove_manager(dept_id: int, head_id: int, db: Session = Depends(get_db)):
    mapping = db.query(models.DepartmentManagerMapping).filter_by(
        Department_ID=dept_id, Head_ID=head_id
    ).first()
    if mapping:
        db.delete(mapping)
        db.commit()


# ─── Project Mapping ──────────────────────────────────────────────────────────

@router.get("/{dept_id}/projects", response_model=List[ProjectOut])
def list_projects(dept_id: int, db: Session = Depends(get_db)):
    """Return all past projects for a department."""
    return db.query(models.DepartmentProjectMapping).filter_by(
        Department_ID=dept_id
    ).all()


@router.post("/{dept_id}/projects", response_model=ProjectOut, status_code=201)
def add_project(dept_id: int, payload: ProjectCreate, db: Session = Depends(get_db)):
    """Add a new past project to a department."""
    project = models.DepartmentProjectMapping(
        Department_ID=dept_id,
        **payload.model_dump(),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/{dept_id}/projects/{project_id}", response_model=ProjectOut)
def update_project(
    dept_id: int, project_id: int, payload: ProjectUpdate,
    db: Session = Depends(get_db),
):
    """Update an existing past project."""
    project = db.query(models.DepartmentProjectMapping).filter_by(
        DPrM_ID=project_id, Department_ID=dept_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{dept_id}/projects/{project_id}", status_code=204)
def delete_project(dept_id: int, project_id: int, db: Session = Depends(get_db)):
    """Delete a past project from a department."""
    project = db.query(models.DepartmentProjectMapping).filter_by(
        DPrM_ID=project_id, Department_ID=dept_id
    ).first()
    if project:
        db.delete(project)
        db.commit()


@router.put("/{dept_id}/projects", response_model=List[ProjectOut])
def sync_projects(dept_id: int, payload: List[ProjectCreate], db: Session = Depends(get_db)):
    """
    Full replace (sync) of all projects for a department.
    Deletes all existing projects and inserts the new list in one transaction.
    Called by the frontend saveDept to keep the projects tab in sync.
    """
    db.query(models.DepartmentProjectMapping).filter_by(
        Department_ID=dept_id
    ).delete(synchronize_session=False)
    new_projects = []
    for item in payload:
        p = models.DepartmentProjectMapping(
            Department_ID=dept_id,
            **item.model_dump(),
        )
        db.add(p)
        new_projects.append(p)
    db.commit()
    for p in new_projects:
        db.refresh(p)
    return new_projects


# ─── Tender History ─────────────────────────────────────────────────────────

@router.get("/{dept_id}/tenders", response_model=List[TenderHistoryOut])
def list_tender_history(dept_id: int, db: Session = Depends(get_db)):
    """Return all previous tender records for a department."""
    return db.query(models.DepartmentTenderHistory).filter_by(
        Department_ID=dept_id
    ).all()


@router.put("/{dept_id}/tenders", response_model=List[TenderHistoryOut])
def sync_tender_history(dept_id: int, payload: List[TenderHistoryCreate], db: Session = Depends(get_db)):
    """
    Full replace (sync) of all previous tenders for a department.
    Deletes existing records and inserts the new list in one transaction.
    """
    db.query(models.DepartmentTenderHistory).filter_by(
        Department_ID=dept_id
    ).delete(synchronize_session=False)
    new_records = []
    for item in payload:
        t = models.DepartmentTenderHistory(
            Department_ID=dept_id,
            **item.model_dump(),
        )
        db.add(t)
        new_records.append(t)
    db.commit()
    for t in new_records:
        db.refresh(t)
    return new_records


@router.post("/{dept_id}/generate-keywords", response_model=List[str])
async def generate_keywords_ai(dept_id: int, db: Session = Depends(get_db)):
    """Use Gemini Flash to suggest 2-10 new search keywords for a department."""
    dept = db.query(models.DepartmentMaster).options(*_load_opts()).filter(
        models.DepartmentMaster.Department_ID == dept_id
    ).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    existing = [
        m.keyword.Keyword
        for m in (dept.keyword_mapping or [])
        if m.keyword
    ]
    
    # Gather context from previous projects and tenders
    projects = []
    for p in (dept.project_mapping or []):
        desc = p.Description if p.Description else "No description"
        projects.append(f"- {p.Project_Title} ({desc})")
    
    tenders = []
    for t in (dept.tender_history or []):
        tenders.append(f"- {t.Tender_Title}")

    projects_context = "\n".join(projects) if projects else "None"
    tenders_context = "\n".join(tenders) if tenders else "None"

    prompt = (
        f'You are a procurement intelligence assistant.\n'
        f'A department named "{dept.Department_Name}" in sector '
        f'"{getattr(dept, "Sector_Name", None) or "General"}" wants to discover '
        f'relevant government tenders.\n'
        f'Keywords already mapped: {existing or ["None"]}\n\n'
        f'Context from Previous Projects:\n{projects_context}\n\n'
        f'Context from Previous Tenders:\n{tenders_context}\n\n'
        f'Based on the department details, previous projects, and previous tenders, '
        f'suggest between 2 and 10 NEW search keywords (not already in the list above) '
        f'that would help this department discover relevant tenders.\n'
        f'Return ONLY a JSON array of strings. No explanation, no markdown fences.\n'
        f'Example: ["civil works", "construction", "infrastructure"]'
    )

    try:
        response = await _genai_client.aio.models.generate_content(
            model=_FLASH_MODEL,
            contents=prompt,
        )
        text = response.text.strip()
        # Strip markdown code fences if present
        text = re.sub(r"^```[a-z]*\n?", "", text).rstrip("`").strip()
        keywords = json.loads(text)
        if not isinstance(keywords, list):
            raise ValueError("Expected a JSON array")
        return [str(k).strip() for k in keywords[:10] if str(k).strip()]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {exc}")
