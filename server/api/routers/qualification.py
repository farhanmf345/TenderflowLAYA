from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from core import models
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class QualOut(BaseModel):
    Result_ID: int
    Tender_ID: int
    Department_ID: int
    Score: float
    Verdict: str
    Dimensions_JSON: str
    Gaps_JSON: str
    Strengths_JSON: str
    Recommendations_JSON: str
    Hard_Disqualifiers_JSON: str
    Reasoning: str
    Evaluated_At: datetime
    class Config: from_attributes = True

@router.get("/", response_model=List[QualOut])
def list_results(
    tender_id: Optional[int] = None,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.QualificationResult)
    if tender_id:
        q = q.filter(models.QualificationResult.Tender_ID == tender_id)
    if department_id:
        q = q.filter(models.QualificationResult.Department_ID == department_id)
    return q.order_by(models.QualificationResult.Evaluated_At.desc()).all()
