"""
Pydantic schemas for CompanyMaster and related mappings.
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


# ─── Nested brief schemas ─────────────────────────────────────────────────────

class EquipmentBrief(BaseModel):
    PEM_ID: int
    Equipment_NAME: str
    class Config: from_attributes = True


class StateBrief(BaseModel):
    State_ID: int
    State_Name: str
    State_Code: str
    class Config: from_attributes = True


class StateMappingBrief(BaseModel):
    state: StateBrief
    class Config: from_attributes = True


class CertBrief(BaseModel):
    Certificate_ID: int
    Certificate_NAME: str
    class Config: from_attributes = True


class CertMappingBrief(BaseModel):
    certificate: CertBrief
    class Config: from_attributes = True


# ─── Core company schemas ─────────────────────────────────────────────────────

class CompanyBase(BaseModel):
    Company_Name: str
    Company_Description: Optional[str] = None
    Valid_From: datetime
    Valid_To: datetime
    Is_Active: bool = True
    Annual_Turnover_Cr: float = 0
    Net_Worth_Cr: float = 0
    Current_Ratio: float = 0
    Years_Of_Operation: int = 0
    Key_Personnel_Count: int = 0
    Is_MSME: bool = False
    Is_Startup: bool = False
    Is_Women_Led: bool = False
    # Global scraper parameters (stored in CompanyMaster; enforced at agent-creation time)
    Max_Concurrent_Scrapes: int = 2
    Scrape_Gap_Sec: float = 10.0
    Max_Retries: int = 2
    Retry_Interval_Sec: float = 60.0


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    Company_Name: Optional[str] = None
    Company_Description: Optional[str] = None
    Valid_From: Optional[datetime] = None
    Valid_To: Optional[datetime] = None
    Is_Active: Optional[bool] = None
    Annual_Turnover_Cr: Optional[float] = None
    Net_Worth_Cr: Optional[float] = None
    Current_Ratio: Optional[float] = None
    Years_Of_Operation: Optional[int] = None
    Key_Personnel_Count: Optional[int] = None
    Is_MSME: Optional[bool] = None
    Is_Startup: Optional[bool] = None
    Is_Women_Led: Optional[bool] = None
    # Global scraper parameters
    Max_Concurrent_Scrapes: Optional[int] = None
    Scrape_Gap_Sec: Optional[float] = None
    Max_Retries: Optional[int] = None
    Retry_Interval_Sec: Optional[float] = None


class CompanyOut(CompanyBase):
    Company_ID: int
    Created_On: datetime
    Updated_On: datetime
    equipment: List[EquipmentBrief] = []
    states: List[StateMappingBrief] = []
    cert_mapping: List[CertMappingBrief] = []

    class Config:
        from_attributes = True


# ─── Sub-resource update payloads ─────────────────────────────────────────────

class EquipmentItem(BaseModel):
    name: str
    qty: str   # free-text quantity / detail stored in Equipment_NAME as "name||qty"


class EquipmentBulkUpdate(BaseModel):
    items: List[EquipmentItem]


class StatesBulkUpdate(BaseModel):
    state_names: List[str]   # list of State_Name strings


class CertsBulkUpdate(BaseModel):
    certificate_ids: List[int]
