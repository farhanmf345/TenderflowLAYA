"""
Token Usage API router for TenderFlow v4.0

Exposes AI token consumption data logged in AITokenUsageLog.
Used by the /token-usage React page for cost monitoring per pipeline stage.

Endpoints:
  GET /api/token-usage/          → Recent log entries (filterable)
  GET /api/token-usage/summary   → Aggregated by Stage + Model
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from core.database import get_db
from core import models
from schemas.token_usage import TokenUsageOut, TokenUsageSummary, TokenUsageSummaryRow
from typing import List, Optional

router = APIRouter()


# ─── Gemini pricing constants (USD per 1M tokens) ────────────────────────────
# Update when Google changes pricing
_PRICING = {
    "gemini-1.5-flash":       {"input": 0.075, "output": 0.30},
    "gemini-1.5-pro":         {"input": 3.50,  "output": 10.50},
    "gemini-2.0-flash":       {"input": 0.075, "output": 0.30},
    "gemini-2.5-flash":       {"input": 0.075, "output": 0.30},
    "gemini-2.5-pro":         {"input": 3.50,  "output": 10.50},
    "gemini-3-flash-preview": {"input": 0.075, "output": 0.30},
    "gemini-3.1-pro-preview": {"input": 3.50,  "output": 10.50},
}

def _cost(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = _PRICING.get(model, {"input": 0.075, "output": 0.30})
    return round(
        (input_tokens  * rates["input"]  / 1_000_000) +
        (output_tokens * rates["output"] / 1_000_000),
        6,
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[TokenUsageOut])
def list_token_usage(
    limit: int = Query(100, ge=1, le=1000),
    stage: Optional[str] = None,
    model: Optional[str] = None,
    scraper_agent_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """
    Return recent AI token usage log entries.
    Filterable by stage (SCRAPE / VALIDATE_FLASH / QUALIFY), model, and agent.
    """
    q = db.query(models.AITokenUsageLog)
    if stage:
        q = q.filter(models.AITokenUsageLog.Stage == stage)
    if model:
        q = q.filter(models.AITokenUsageLog.Model == model)
    if scraper_agent_id:
        q = q.filter(models.AITokenUsageLog.Scraper_Agent_ID == scraper_agent_id)
    return q.order_by(desc(models.AITokenUsageLog.Timestamp)).limit(limit).all()


@router.get("/summary", response_model=TokenUsageSummary)
def get_token_usage_summary(db: Session = Depends(get_db)):
    """
    Return aggregated token usage grouped by Stage + Model.
    Also returns grand totals for dashboard cards.
    """
    rows = (
        db.query(
            models.AITokenUsageLog.Stage,
            models.AITokenUsageLog.Model,
            func.sum(models.AITokenUsageLog.Input_Tokens).label("total_input"),
            func.sum(models.AITokenUsageLog.Output_Tokens).label("total_output"),
            func.sum(models.AITokenUsageLog.Estimated_Cost_USD).label("total_cost"),
            func.count(models.AITokenUsageLog.Usage_ID).label("call_count"),
        )
        .group_by(models.AITokenUsageLog.Stage, models.AITokenUsageLog.Model)
        .all()
    )

    summary_rows = [
        TokenUsageSummaryRow(
            Stage=r.Stage,
            Model=r.Model,
            Total_Input_Tokens=int(r.total_input or 0),
            Total_Output_Tokens=int(r.total_output or 0),
            Total_Cost_USD=round(float(r.total_cost or 0), 6),
            Call_Count=int(r.call_count or 0),
        )
        for r in rows
    ]

    grand_cost   = sum(r.Total_Cost_USD for r in summary_rows)
    grand_input  = sum(r.Total_Input_Tokens for r in summary_rows)
    grand_output = sum(r.Total_Output_Tokens for r in summary_rows)

    return TokenUsageSummary(
        rows=summary_rows,
        grand_total_cost_usd=round(grand_cost, 6),
        grand_total_input_tokens=grand_input,
        grand_total_output_tokens=grand_output,
    )
