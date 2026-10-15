from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


# ─── Nested brief schemas (for embedded relationships) ───────────────────────

class PortalBrief(BaseModel):
    Portal_ID: int
    Portal_Name: str
    Base_URL: str
    class Config: from_attributes = True


class KeywordBrief(BaseModel):
    Keyword_ID: int
    Keyword: str
    class Config: from_attributes = True


class ManagerBrief(BaseModel):
    Head_ID: int
    Head_Name: str
    Email: str
    class Config: from_attributes = True


class CriteriaBrief(BaseModel):
    Criteria_ID: int
    Criteria_Type: str
    Target_Field: str
    Operator: str
    Target_Value: str
    Action: Optional[str] = 'Discard'   # Discard | Accept
    Is_Active: bool
    class Config: from_attributes = True


class PortalMappingBrief(BaseModel):
    portal: PortalBrief
    class Config: from_attributes = True


class KeywordMappingBrief(BaseModel):
    keyword: KeywordBrief
    class Config: from_attributes = True


class ManagerMappingBrief(BaseModel):
    manager: ManagerBrief
    class Config: from_attributes = True


# ─── Department Project schemas ───────────────────────────────────────────────

class ProjectCreate(BaseModel):
    Project_Title: str
    Client_Name: Optional[str] = None
    Value_Cr: Optional[float] = None
    Completion_Year: Optional[int] = None
    Duration_Months: Optional[int] = None
    Sector_Name: Optional[str] = None
    Description: Optional[str] = None
    Keywords_JSON: Optional[str] = None   # serialised JSON array e.g. '["SAP","Cloud"]'
    Cert_Issued: bool = False


class ProjectUpdate(ProjectCreate):
    pass


class ProjectOut(ProjectCreate):
    DPrM_ID: int
    Department_ID: int
    Created_On: datetime

    class Config:
        from_attributes = True


# ─── Department Tender History schemas ───────────────────────────────────────

class TenderHistoryCreate(BaseModel):
    Tender_Title: str
    Tender_Ref: Optional[str] = None
    Issuing_Org: Optional[str] = None
    Portal_Source: Optional[str] = None
    Submission_Date: Optional[str] = None   # YYYY-MM-DD
    Outcome: Optional[str] = None           # WON | LOST | SHORTLISTED | DISQUALIFIED | SUBMITTED
    Value_Cr: Optional[float] = None
    Sector_Name: Optional[str] = None
    Notes: Optional[str] = None


class TenderHistoryUpdate(TenderHistoryCreate):
    pass


class TenderHistoryOut(TenderHistoryCreate):
    DTH_ID: int
    Department_ID: int
    Created_On: datetime

    class Config:
        from_attributes = True


# ─── Core department schemas ──────────────────────────────────────────────────

class DepartmentBase(BaseModel):
    Department_Name: str
    Dept_Code: Optional[str] = None
    Valid_From: datetime
    Valid_To: datetime
    Sector_ID: int
    Description: Optional[str] = None


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    Department_Name: Optional[str] = None
    Dept_Code: Optional[str] = None
    Valid_From: Optional[datetime] = None
    Valid_To: Optional[datetime] = None
    Sector_ID: Optional[int] = None
    Description: Optional[str] = None


class DepartmentOut(DepartmentBase):
    Department_ID: int
    Created_On: datetime
    Updated_On: datetime
    portal_mapping: List[PortalMappingBrief] = []
    keyword_mapping: List[KeywordMappingBrief] = []
    criteria: List[CriteriaBrief] = []
    manager_mapping: List[ManagerMappingBrief] = []
    project_mapping: List[ProjectOut] = []
    tender_history: List[TenderHistoryOut] = []

    class Config:
        from_attributes = True
