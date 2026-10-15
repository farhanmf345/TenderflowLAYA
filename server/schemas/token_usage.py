"""
Pydantic schemas for AITokenUsageLog.
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class TokenUsageOut(BaseModel):
    Usage_ID: int
    Stage: str
    Model: str
    Input_Tokens: int
    Output_Tokens: int
    Estimated_Cost_USD: float
    Scraper_Agent_ID: Optional[int] = None
    Tender_ID: Optional[int] = None
    Timestamp: datetime

    class Config:
        from_attributes = True


class TokenUsageSummaryRow(BaseModel):
    """Aggregated row per Stage + Model combination."""
    Stage: str
    Model: str
    Total_Input_Tokens: int
    Total_Output_Tokens: int
    Total_Cost_USD: float
    Call_Count: int


class TokenUsageSummary(BaseModel):
    rows: List[TokenUsageSummaryRow]
    grand_total_cost_usd: float
    grand_total_input_tokens: int
    grand_total_output_tokens: int
