from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Database
    db_url: str

    # Gemini API
    gemini_api_key: str

    # ── Gemini Model Selection ────────────────────────────────────────────────
    # Flash: used for validator pre-checks, summary generation, qualifier narrative
    gemini_flash_model: str = "gemini-3-flash-preview"
    # Pro: used for scraper agent extraction (higher accuracy on complex HTML)
    gemini_pro_model: str = "gemini-3.1-pro-preview"

    # ── Tender requirement classifier (core/tender_requirements.py) ──────────
    # "off" | "laya" | "gemini". Off by default; nothing is called or stored.
    requirements_backend: str = "laya"
    # Answers at or above this probability are treated as "yes"; below = unknown/no.
    requirements_confidence: float = 0.7

    # Email / SMTP / Power Automate
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from_name: str = "TenderFlow"
    power_automate_webhook: str = ""

    # ChromaDB
    chroma_path: str = "./chroma_data"

    # App
    debug: bool = True
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
