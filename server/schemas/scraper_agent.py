"""
Pydantic schemas for ScraperAgentMaster.
Note: Global scraper parameters (Max_Concurrent, Scrape_Gap_Sec, Max_Retries, Retry_Interval_Sec)
are now stored in CompanyMaster and managed via GET/PUT /api/scheduler/globals.
"""
from pydantic import BaseModel
from typing import Optional


class ScraperAgentBase(BaseModel):
    Portal_ID: int
    Freq_ID: int
    Is_Active: bool = True
    Freq_Config_JSON: str


class ScraperAgentCreate(ScraperAgentBase):
    pass


class ScraperAgentUpdate(BaseModel):
    Portal_ID: Optional[int] = None
    Freq_ID: Optional[int] = None
    Is_Active: Optional[bool] = None
    Freq_Config_JSON: Optional[str] = None


class ScraperAgentOut(ScraperAgentBase):
    ScraperAgent_ID: int

    class Config:
        from_attributes = True

