from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core.database import get_db
from core import models
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class LogOut(BaseModel):
    Log_ID: int
    Event_Type: str
    Tender_ID: Optional[int]
    Department_ID: Optional[int]
    Status: str
    Details_JSON: str
    Timestamp: datetime
    class Config: from_attributes = True

@router.get("/", response_model=List[LogOut])
def list_logs(
    department_id: Optional[int] = None,
    event_type: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    q = db.query(models.ActivityLog)
    if department_id:
        q = q.filter(models.ActivityLog.Department_ID == department_id)
    if event_type:
        q = q.filter(models.ActivityLog.Event_Type == event_type)
    return q.order_by(models.ActivityLog.Timestamp.desc()).limit(limit).all()
