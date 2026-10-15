from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CriteriaBase(BaseModel):
    Department_ID: int
    Criteria_Type: str      # PRE_FILTER | QUAL_GATE
    Target_Field: str
    Operator: str
    Target_Value: str
    Action: Optional[str] = 'Discard'   # Discard | Accept
    Is_Active: bool = True


class CriteriaCreate(CriteriaBase):
    pass


class CriteriaUpdate(BaseModel):
    Criteria_Type: Optional[str] = None
    Target_Field: Optional[str] = None
    Operator: Optional[str] = None
    Target_Value: Optional[str] = None
    Action: Optional[str] = None        # Discard | Accept
    Is_Active: Optional[bool] = None


class CriteriaOut(CriteriaBase):
    Criteria_ID: int
    Created_On: datetime
    Updated_On: datetime

    class Config:
        from_attributes = True
