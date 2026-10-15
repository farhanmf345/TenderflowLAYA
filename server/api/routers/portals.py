from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core.database import get_db
from core import models
from typing import List
from pydantic import BaseModel

router = APIRouter()

class PortalOut(BaseModel):
    Portal_ID: int
    Portal_Name: str
    Base_URL: str
    class Config: from_attributes = True

class PortalCreate(BaseModel):
    Portal_Name: str
    Base_URL: str

@router.get("/", response_model=List[PortalOut])
def list_portals(db: Session = Depends(get_db)):
    return db.query(models.WhitelistPortalMaster).all()

@router.post("/", response_model=PortalOut, status_code=201)
def create_portal(payload: PortalCreate, db: Session = Depends(get_db)):
    portal = models.WhitelistPortalMaster(**payload.model_dump())
    db.add(portal)
    db.commit()
    db.refresh(portal)
    return portal

@router.delete("/{portal_id}", status_code=204)
def delete_portal(portal_id: int, db: Session = Depends(get_db)):
    portal = db.query(models.WhitelistPortalMaster).filter(
        models.WhitelistPortalMaster.Portal_ID == portal_id
    ).first()
    if not portal:
        raise HTTPException(status_code=404, detail="Portal not found.")
    db.delete(portal)
    db.commit()
