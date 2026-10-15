from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from core.database import get_db
from core import models
from datetime import datetime, timedelta
from typing import Dict, List, Any

router = APIRouter()

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    # Total Tenders Scraped
    total_scraped = db.query(models.TenderDetails).count()
    
    # Eligible Tenders (distinct tender IDs)
    eligible_tenders = db.query(
        func.count(func.distinct(models.QualificationResult.Tender_ID))
    ).filter(
        models.QualificationResult.Verdict == 'ELIGIBLE'
    ).scalar() or 0
    
    # Active Departments
    now = datetime.now()
    active_departments = db.query(models.DepartmentMaster).filter(
        models.DepartmentMaster.Valid_From <= now,
        models.DepartmentMaster.Valid_To >= now
    ).count()
    
    # Pipeline Events
    pipeline_events = db.query(models.ActivityLog).count()
    
    return {
        "total_scraped": total_scraped,
        "eligible_tenders": eligible_tenders,
        "active_departments": active_departments,
        "pipeline_events": pipeline_events
    }

@router.get("/trend")
def get_dashboard_trend(db: Session = Depends(get_db)):
    """Weekly Tender Trend - last 7 days, grouped by creation date."""
    from sqlalchemy.types import Date
    from sqlalchemy import cast

    today = datetime.now().date()

    # Pre-fill every day in range with 0 so days with no tenders still appear
    counts_by_date: dict = {}
    for i in range(6, -1, -1):
        counts_by_date[today - timedelta(days=i)] = 0

    start_dt = datetime.combine(today - timedelta(days=6), datetime.min.time())

    # Build the date expression once so we can reuse it in group_by
    date_expr = cast(models.TenderDetails.Created_On, Date)

    rows = (
        db.query(date_expr.label("d"), func.count(models.TenderDetails.Tender_ID).label("c"))
        .filter(models.TenderDetails.Created_On >= start_dt)
        .group_by(date_expr)           #  PostgreSQL-safe: group by expression, not alias
        .all()
    )

    for row in rows:
        try:
            d_val = row.d.date() if isinstance(row.d, datetime) else row.d
            if isinstance(d_val, str):
                d_val = datetime.strptime(d_val, "%Y-%m-%d").date()
            if d_val in counts_by_date:
                counts_by_date[d_val] = row.c
        except Exception:
            pass

    return [
        {"date": d.strftime("%Y-%m-%d"), "day": d.strftime("%a"), "count": c}
        for d, c in counts_by_date.items()
    ]
