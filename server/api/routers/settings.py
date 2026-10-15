from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# In-memory settings store (replace with DB-backed settings table in v5)
_settings = {
    "theme": "light",
    "email_from_name": "TenderFlow",
    "reply_to": "",
}

class SettingsOut(BaseModel):
    theme: str
    email_from_name: str
    reply_to: str

class SettingsUpdate(BaseModel):
    theme: str | None = None
    email_from_name: str | None = None
    reply_to: str | None = None

@router.get("/", response_model=SettingsOut)
def get_settings():
    return _settings

@router.put("/", response_model=SettingsOut)
def update_settings(payload: SettingsUpdate):
    for k, v in payload.model_dump(exclude_none=True).items():
        _settings[k] = v
    return _settings

class TestEmailRequest(BaseModel):
    email: str

@router.post("/test-email")
def test_email(payload: TestEmailRequest):
    from core.email_service import send_test_email
    success = send_test_email(payload.email)
    if success:
        return {"status": "success", "message": "Test email sent"}
    from fastapi import HTTPException
    raise HTTPException(status_code=500, detail="Failed to send test email")
