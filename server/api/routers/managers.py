from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from core.database import get_db
from core import models

router = APIRouter()

class ManagerOut(BaseModel):
    Head_ID: int
    Head_Name: str
    Email: str
    Is_Active: bool

    class Config:
        from_attributes = True

@router.get("/", response_model=List[ManagerOut])
def list_managers(db: Session = Depends(get_db)):
    """Fetch all tender managers."""
    return db.query(models.TenderManagerMaster).filter_by(Is_Active=True).all()
