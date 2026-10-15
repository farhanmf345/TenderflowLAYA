from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from core import models
from typing import List
from pydantic import BaseModel

router = APIRouter()

class SectorOut(BaseModel):
    Sector_ID: int
    Sector_Name: str
    Is_Active: bool
    class Config: from_attributes = True

@router.get("/", response_model=List[SectorOut])
def list_sectors(db: Session = Depends(get_db)):
    return db.query(models.SectorMaster).filter(models.SectorMaster.Is_Active == True).all()
