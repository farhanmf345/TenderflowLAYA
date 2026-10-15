from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from core.database import get_db
from core import models
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()

class KeywordOut(BaseModel):
    Keyword_ID: int
    Keyword: str
    Sector_ID: int
    class Config: from_attributes = True

class KeywordCreate(BaseModel):
    Keyword: str
    Sector_ID: int

@router.get("/", response_model=List[KeywordOut])
def list_keywords(sector_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.KeywordMaster)
    if sector_id:
        q = q.filter(models.KeywordMaster.Sector_ID == sector_id)
    return q.all()

@router.post("/", response_model=KeywordOut, status_code=200)
def get_or_create_keyword(payload: KeywordCreate, db: Session = Depends(get_db)):
    """Upsert: return existing keyword if it exists, otherwise create it."""
    kw = db.query(models.KeywordMaster).filter(
        func.lower(models.KeywordMaster.Keyword) == func.lower(payload.Keyword.strip()),
        models.KeywordMaster.Sector_ID == payload.Sector_ID,
    ).first()
    if kw:
        return kw
    kw = models.KeywordMaster(Keyword=payload.Keyword.strip(), Sector_ID=payload.Sector_ID)
    db.add(kw)
    db.commit()
    db.refresh(kw)
    return kw
