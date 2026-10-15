from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from core.database import get_db
from core import models
from schemas.criteria import CriteriaCreate, CriteriaUpdate, CriteriaOut
from typing import List, Optional

router = APIRouter()


@router.get("/", response_model=List[CriteriaOut])
def list_criteria(department_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(models.ParticipationCriteriaMaster)
    if department_id:
        q = q.filter(models.ParticipationCriteriaMaster.Department_ID == department_id)
    return q.all()


@router.post("/", response_model=CriteriaOut, status_code=201)
def create_criteria(payload: CriteriaCreate, db: Session = Depends(get_db)):
    obj = models.ParticipationCriteriaMaster(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/{criteria_id}", response_model=CriteriaOut)
def update_criteria(criteria_id: int, payload: CriteriaUpdate, db: Session = Depends(get_db)):
    obj = db.query(models.ParticipationCriteriaMaster).filter(
        models.ParticipationCriteriaMaster.Criteria_ID == criteria_id
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Criteria not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{criteria_id}", status_code=204)
def delete_criteria(criteria_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.ParticipationCriteriaMaster).filter(
        models.ParticipationCriteriaMaster.Criteria_ID == criteria_id
    ).first()
    if obj:
        db.delete(obj)
        db.commit()
