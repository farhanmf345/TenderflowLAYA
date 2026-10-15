from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from core.database import get_db
from core import models
from schemas.company import (
    CompanyCreate, CompanyUpdate, CompanyOut,
    EquipmentBulkUpdate, StatesBulkUpdate, CertsBulkUpdate,
)
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()


# ─── Eager-load helper ────────────────────────────────────────────────────────

def _load_opts():
    return [
        selectinload(models.CompanyMaster.equipment),
        selectinload(models.CompanyMaster.states).selectinload(
            models.ProfileStateMapping.state
        ),
        selectinload(models.CompanyMaster.cert_mapping).selectinload(
            models.CompanyCertificateMapping.certificate
        ),
    ]


# ─── Core Company CRUD ────────────────────────────────────────────────────────

@router.get("/profile", response_model=CompanyOut)
def get_company(db: Session = Depends(get_db)):
    """Return the single company profile with all nested data."""
    company = db.query(models.CompanyMaster).options(*_load_opts()).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company profile not found.")
    return company


@router.post("/profile", response_model=CompanyOut, status_code=201)
def create_company(payload: CompanyCreate, db: Session = Depends(get_db)):
    """First-time company profile creation."""
    if db.query(models.CompanyMaster).first():
        raise HTTPException(status_code=400, detail="Company profile already exists. Use PUT to update.")
    company = models.CompanyMaster(**payload.model_dump())
    db.add(company)
    db.commit()
    return db.query(models.CompanyMaster).options(*_load_opts()).filter(
        models.CompanyMaster.Company_ID == company.Company_ID
    ).first()


@router.put("/profile/{company_id}", response_model=CompanyOut)
def update_company(company_id: int, payload: CompanyUpdate, db: Session = Depends(get_db)):
    """Update core company fields."""
    company = db.query(models.CompanyMaster).filter(
        models.CompanyMaster.Company_ID == company_id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    return db.query(models.CompanyMaster).options(*_load_opts()).filter(
        models.CompanyMaster.Company_ID == company_id
    ).first()


# ─── Equipment Sub-resource ───────────────────────────────────────────────────

@router.put("/profile/{company_id}/equipment", response_model=CompanyOut)
def update_equipment(company_id: int, payload: EquipmentBulkUpdate, db: Session = Depends(get_db)):
    """Replace the company's full equipment / asset list."""
    db.query(models.ProfileEquipmentMapping).filter_by(Company_ID=company_id).delete()
    for item in payload.items:
        if not item.name.strip():
            continue
        # Store as "name||qty" so frontend can reconstruct both fields
        combined = f"{item.name.strip()}||{item.qty.strip()}" if item.qty.strip() else item.name.strip()
        db.add(models.ProfileEquipmentMapping(Equipment_NAME=combined, Company_ID=company_id))
    db.commit()
    return db.query(models.CompanyMaster).options(*_load_opts()).filter(
        models.CompanyMaster.Company_ID == company_id
    ).first()


# ─── Registered States Sub-resource ──────────────────────────────────────────

@router.put("/profile/{company_id}/states", response_model=CompanyOut)
def update_states(company_id: int, payload: StatesBulkUpdate, db: Session = Depends(get_db)):
    """Replace the company's registered state list by state names.
    Auto-creates StateMaster entries for states not yet in the DB.
    """
    db.query(models.ProfileStateMapping).filter_by(Company_ID=company_id).delete()
    for state_name in payload.state_names:
        state_name = state_name.strip()
        if not state_name:
            continue
        state = db.query(models.StateMaster).filter(
            models.StateMaster.State_Name == state_name
        ).first()
        if not state:
            # Auto-create with a 2-letter code derived from the name
            code = ''.join(w[0] for w in state_name.split())[:3].upper()
            state = models.StateMaster(State_Name=state_name, State_Code=code)
            db.add(state)
            db.flush()   # get State_ID without full commit
        db.add(models.ProfileStateMapping(State_ID=state.State_ID, Company_ID=company_id))
    db.commit()
    return db.query(models.CompanyMaster).options(*_load_opts()).filter(
        models.CompanyMaster.Company_ID == company_id
    ).first()


# ─── Certifications Sub-resource ─────────────────────────────────────────────

@router.put("/profile/{company_id}/certifications", response_model=CompanyOut)
def update_certifications(company_id: int, payload: CertsBulkUpdate, db: Session = Depends(get_db)):
    """Replace the set of certifications the company holds."""
    db.query(models.CompanyCertificateMapping).filter_by(Company_ID=company_id).delete()
    for cert_id in payload.certificate_ids:
        db.add(models.CompanyCertificateMapping(
            Company_ID=company_id, Certificate_ID=cert_id
        ))
    db.commit()
    return db.query(models.CompanyMaster).options(*_load_opts()).filter(
        models.CompanyMaster.Company_ID == company_id
    ).first()


# ─── Certificate Master CRUD ──────────────────────────────────────────────────

class CertOut(BaseModel):
    Certificate_ID: int
    Certificate_NAME: str
    Description: Optional[str] = None
    class Config: from_attributes = True

class CertCreate(BaseModel):
    Certificate_NAME: str
    Description: Optional[str] = None


@router.get("/certificates", response_model=List[CertOut])
def list_certificates(db: Session = Depends(get_db)):
    """Return all available certificates from CertificateMaster."""
    return db.query(models.CertificateMaster).order_by(
        models.CertificateMaster.Certificate_NAME
    ).all()


@router.post("/certificates", response_model=CertOut, status_code=200)
def upsert_certificate(payload: CertCreate, db: Session = Depends(get_db)):
    """Upsert: return existing cert if name matches, otherwise create it."""
    existing = db.query(models.CertificateMaster).filter(
        models.CertificateMaster.Certificate_NAME == payload.Certificate_NAME.strip()
    ).first()
    if existing:
        return existing
    cert = models.CertificateMaster(
        Certificate_NAME=payload.Certificate_NAME.strip(),
        Description=payload.Description,
    )
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return cert


# ─── State Master (read-only lookup) ─────────────────────────────────────────

class StateOut(BaseModel):
    State_ID: int
    State_Name: str
    State_Code: str
    class Config: from_attributes = True


@router.get("/states", response_model=List[StateOut])
def list_states(db: Session = Depends(get_db)):
    """Return all states from StateMaster."""
    return db.query(models.StateMaster).order_by(models.StateMaster.State_Name).all()
