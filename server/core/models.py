from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, func
)
from sqlalchemy.orm import relationship
from core.database import Base


# ─── Master / Lookup Tables ──────────────────────────────────────────────────

class SectorMaster(Base):
    __tablename__ = "SectorMaster"

    Sector_ID   = Column(Integer, primary_key=True, autoincrement=True)
    Sector_Name = Column(String(100), nullable=False)
    Is_Active   = Column(Boolean, nullable=False, default=True)
    Created_On  = Column(DateTime, nullable=False, server_default=func.now())

    departments  = relationship("DepartmentMaster", back_populates="sector")
    keywords     = relationship("KeywordMaster", back_populates="sector")
    cert_mapping = relationship("SectorCertificateMapping", back_populates="sector")
    tenders      = relationship("TenderDetails", back_populates="sector")


class CompanyMaster(Base):
    __tablename__ = "CompanyMaster"

    Company_ID             = Column(Integer, primary_key=True, autoincrement=True)
    Company_Name           = Column(String(300), nullable=False)
    Company_Description    = Column(Text, nullable=True)
    Valid_From             = Column(DateTime, nullable=False)
    Valid_To               = Column(DateTime, nullable=False)
    Is_Active              = Column(Boolean, nullable=False, default=True)
    Annual_Turnover_Cr     = Column(Float, nullable=False, default=0)
    Net_Worth_Cr           = Column(Float, nullable=False, default=0)
    Current_Ratio          = Column(Float, nullable=False, default=0)
    Years_Of_Operation     = Column(Integer, nullable=False, default=0)
    Key_Personnel_Count    = Column(Integer, nullable=False, default=0)
    Is_MSME                = Column(Boolean, nullable=False, default=False)
    Is_Startup             = Column(Boolean, nullable=False, default=False)
    Is_Women_Led           = Column(Boolean, nullable=False, default=False)
    # ── Global Scraper Parameters (company-wide limits) ──────────────
    Max_Concurrent_Scrapes    = Column(Integer, nullable=False, default=2)
    Scrape_Gap_Sec            = Column(Float,   nullable=False, default=10.0)
    Max_Retries               = Column(Integer, nullable=False, default=2)
    Retry_Interval_Sec        = Column(Float,   nullable=False, default=60.0)
    ChromaDB_Dedup_Threshold  = Column(Float,   nullable=False, default=0.96)  # 0.0–1.0; higher = stricter dedup

    Created_On             = Column(DateTime, nullable=False, server_default=func.now())
    Updated_On             = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    equipment         = relationship("ProfileEquipmentMapping", back_populates="company")
    states            = relationship("ProfileStateMapping", back_populates="company")
    cert_mapping      = relationship("CompanyCertificateMapping", back_populates="company")


class DepartmentMaster(Base):
    __tablename__ = "DepartmentMaster"

    Department_ID   = Column(Integer, primary_key=True, autoincrement=True)
    Department_Name = Column(String(300), nullable=False)
    Dept_Code       = Column(String(50),  nullable=True)   # Short identifier e.g. "ITS-01"
    Valid_From      = Column(DateTime, nullable=False)
    Valid_To        = Column(DateTime, nullable=False)
    Sector_ID       = Column(Integer, ForeignKey("SectorMaster.Sector_ID"), nullable=False)
    Description     = Column(String(1000), nullable=True)  # Free-text description of the department
    Created_On      = Column(DateTime, nullable=False, server_default=func.now())
    Updated_On      = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    sector           = relationship("SectorMaster", back_populates="departments")
    criteria         = relationship("ParticipationCriteriaMaster", back_populates="department", cascade="all, delete-orphan")
    manager_mapping  = relationship("DepartmentManagerMapping",    back_populates="department", cascade="all, delete-orphan")
    portal_mapping   = relationship("DepartmentPortalMapping",     back_populates="department", cascade="all, delete-orphan")
    keyword_mapping  = relationship("DepartmentKeywordMapping",    back_populates="department", cascade="all, delete-orphan")
    project_mapping  = relationship("DepartmentProjectMapping",    back_populates="department", cascade="all, delete-orphan")
    tender_history   = relationship("DepartmentTenderHistory",     back_populates="department", cascade="all, delete-orphan")
    qual_results     = relationship("QualificationResult",         back_populates="department")
    activity_logs    = relationship("ActivityLog",                 back_populates="department")


class ParticipationCriteriaMaster(Base):
    __tablename__ = "ParticipationCriteriaMaster"

    Criteria_ID   = Column(Integer, primary_key=True, autoincrement=True)
    Department_ID = Column(Integer, ForeignKey("DepartmentMaster.Department_ID"), nullable=False)
    Criteria_Type = Column(String(300), nullable=False)   # PRE_FILTER | QUAL_GATE
    Target_Field  = Column(String(300), nullable=False)
    Operator      = Column(String(30),  nullable=False)
    Target_Value  = Column(String(300), nullable=False)
    Action        = Column(String(20),  nullable=True, default='Discard')  # Discard | Accept
    Created_On    = Column(DateTime, nullable=False, server_default=func.now())
    Updated_On    = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    Is_Active     = Column(Boolean, nullable=False, default=True)

    department = relationship("DepartmentMaster", back_populates="criteria")


class FrequencyMaster(Base):
    __tablename__ = "FrequencyMaster"

    Freq_ID   = Column(Integer, primary_key=True, autoincrement=True)
    Freq_Type = Column(String(300), nullable=False)

    agents = relationship("ScraperAgentMaster", back_populates="frequency")


class ScraperAgentMaster(Base):
    __tablename__ = "ScraperAgentMaster"

    ScraperAgent_ID  = Column(Integer, primary_key=True, autoincrement=True)
    Portal_ID        = Column(Integer, ForeignKey("WhitelistPortalMaster.Portal_ID"), nullable=False)
    Freq_ID          = Column(Integer, ForeignKey("FrequencyMaster.Freq_ID"), nullable=False)
    Is_Active        = Column(Boolean, nullable=False, default=True)
    Freq_Config_JSON = Column(String(300), nullable=False)
    # Scraper params (Max_Concurrent, Scrape_Gap_Sec, Max_Retries, Retry_Interval_Sec)
    # are now stored globally in CompanyMaster - not per-agent.

    portal       = relationship("WhitelistPortalMaster", back_populates="agents")
    frequency    = relationship("FrequencyMaster", back_populates="agents")
    token_logs   = relationship("AITokenUsageLog", back_populates="scraper_agent", foreign_keys="AITokenUsageLog.Scraper_Agent_ID")


class TenderManagerMaster(Base):
    __tablename__ = "TenderManagerMaster"

    Head_ID       = Column(Integer, primary_key=True, autoincrement=True)
    Head_Name     = Column(String(200), nullable=False)
    Email         = Column(String(254), nullable=False)
    Is_Active     = Column(Boolean, nullable=True, default=True)
    Created_On    = Column(DateTime, nullable=False, server_default=func.now())

    dept_mapping = relationship("DepartmentManagerMapping", back_populates="manager")


class KeywordMaster(Base):
    __tablename__ = "KeywordMaster"

    Keyword_ID = Column(Integer, primary_key=True, autoincrement=True)
    Keyword    = Column(String(50), nullable=False)
    Sector_ID  = Column(Integer, ForeignKey("SectorMaster.Sector_ID"), nullable=False)

    sector           = relationship("SectorMaster", back_populates="keywords")
    dept_assignments = relationship("DepartmentKeywordMapping", back_populates="keyword")


class CertificateMaster(Base):
    __tablename__ = "CertificateMaster"

    Certificate_ID   = Column(Integer, primary_key=True, autoincrement=True)
    Certificate_NAME = Column(String(200), nullable=False)
    Description      = Column(Text, nullable=True)

    sector_mapping   = relationship("SectorCertificateMapping", back_populates="certificate")
    company_mapping  = relationship("CompanyCertificateMapping", back_populates="certificate")


class StateMaster(Base):
    __tablename__ = "StateMaster"

    State_ID   = Column(Integer, primary_key=True, autoincrement=True)
    State_Name = Column(String(100), nullable=False)
    State_Code = Column(String(5), nullable=False)

    profile_mapping = relationship("ProfileStateMapping", back_populates="state")


class WhitelistPortalMaster(Base):
    __tablename__ = "WhitelistPortalMaster"

    Portal_ID   = Column(Integer, primary_key=True, autoincrement=True)
    Portal_Name = Column(String(200), nullable=False)
    Base_URL    = Column(Text, nullable=False)

    agents          = relationship("ScraperAgentMaster", back_populates="portal")
    dept_mapping    = relationship("DepartmentPortalMapping", back_populates="portal")
    tenders         = relationship("TenderDetails", back_populates="portal")


# ─── Mapping Tables ───────────────────────────────────────────────────────────

class CompanyCertificateMapping(Base):
    """Links a company to the certificates it currently holds."""
    __tablename__ = "CompanyCertificateMapping"

    CCM_ID         = Column(Integer, primary_key=True, autoincrement=True)
    Company_ID     = Column(Integer, ForeignKey("CompanyMaster.Company_ID"), nullable=False)
    Certificate_ID = Column(Integer, ForeignKey("CertificateMaster.Certificate_ID"), nullable=False)

    company     = relationship("CompanyMaster", back_populates="cert_mapping")
    certificate = relationship("CertificateMaster", back_populates="company_mapping")


class SectorCertificateMapping(Base):
    __tablename__ = "SectorCertificateMapping"

    SCM_ID         = Column(Integer, primary_key=True, autoincrement=True)
    Sector_ID      = Column(Integer, ForeignKey("SectorMaster.Sector_ID"), nullable=False)
    Certificate_ID = Column(Integer, ForeignKey("CertificateMaster.Certificate_ID"), nullable=False)
    Is_Mandatory   = Column(Boolean, nullable=False, default=False)

    sector      = relationship("SectorMaster", back_populates="cert_mapping")
    certificate = relationship("CertificateMaster", back_populates="sector_mapping")



class ProfileEquipmentMapping(Base):
    __tablename__ = "ProfileEquipmentMapping"

    PEM_ID         = Column(Integer, primary_key=True, autoincrement=True)
    Equipment_NAME = Column(String(300), nullable=False)
    Company_ID     = Column(Integer, ForeignKey("CompanyMaster.Company_ID"), nullable=False)

    company = relationship("CompanyMaster", back_populates="equipment")


class ProfileStateMapping(Base):
    __tablename__ = "ProfileStateMapping"

    PSM_ID     = Column(Integer, primary_key=True, autoincrement=True)
    State_ID   = Column(Integer, ForeignKey("StateMaster.State_ID"), nullable=False)
    Company_ID = Column(Integer, ForeignKey("CompanyMaster.Company_ID"), nullable=False)

    state   = relationship("StateMaster", back_populates="profile_mapping")
    company = relationship("CompanyMaster", back_populates="states")


class DepartmentProjectMapping(Base):
    """Past projects completed by a specific department - used as experience proof during qualification."""
    __tablename__ = "DepartmentProjectMapping"

    DPrM_ID          = Column(Integer, primary_key=True, autoincrement=True)
    Department_ID    = Column(Integer, ForeignKey("DepartmentMaster.Department_ID"), nullable=False)
    Project_Title    = Column(String(500), nullable=False)
    Client_Name      = Column(String(300), nullable=True)
    Value_Cr         = Column(Float, nullable=True)
    Completion_Year  = Column(Integer, nullable=True)
    Duration_Months  = Column(Integer, nullable=True)
    Sector_Name      = Column(String(100), nullable=True)   # free-text sector label
    Description      = Column(Text, nullable=True)
    Keywords_JSON    = Column(Text, nullable=True)           # JSON array of keyword strings
    Cert_Issued      = Column(Boolean, nullable=False, default=False)
    Created_On       = Column(DateTime, nullable=False, server_default=func.now())

    department = relationship("DepartmentMaster", back_populates="project_mapping")


class DepartmentTenderHistory(Base):
    """Previous tenders the department has participated in or won — used as bid history."""
    __tablename__ = "DepartmentTenderHistory"

    DTH_ID           = Column(Integer, primary_key=True, autoincrement=True)
    Department_ID    = Column(Integer, ForeignKey("DepartmentMaster.Department_ID"), nullable=False)
    Tender_Title     = Column(String(500), nullable=False)
    Tender_Ref       = Column(String(200), nullable=True)   # reference / bid number
    Issuing_Org      = Column(String(300), nullable=True)
    Portal_Source    = Column(String(200), nullable=True)   # website / portal name
    Submission_Date  = Column(String(10),  nullable=True)   # YYYY-MM-DD string
    Outcome          = Column(String(50),  nullable=True)   # WON | LOST | SHORTLISTED | DISQUALIFIED | SUBMITTED
    Value_Cr         = Column(Float,       nullable=True)
    Sector_Name      = Column(String(100), nullable=True)
    Notes            = Column(Text,        nullable=True)
    Created_On       = Column(DateTime,    nullable=False, server_default=func.now())

    department = relationship("DepartmentMaster", back_populates="tender_history")


class DepartmentPortalMapping(Base):
    __tablename__ = "DepartmentPortalMapping"

    DPM_ID        = Column(Integer, primary_key=True, autoincrement=True)
    Department_ID = Column(Integer, ForeignKey("DepartmentMaster.Department_ID"), nullable=False)
    Portal_ID     = Column(Integer, ForeignKey("WhitelistPortalMaster.Portal_ID"), nullable=False)

    department = relationship("DepartmentMaster", back_populates="portal_mapping")
    portal     = relationship("WhitelistPortalMaster", back_populates="dept_mapping")


class DepartmentKeywordMapping(Base):
    __tablename__ = "DepartmentKeywordMapping"

    DKM_ID        = Column(Integer, primary_key=True, autoincrement=True)
    Department_ID = Column(Integer, ForeignKey("DepartmentMaster.Department_ID"), nullable=False)
    Keyword_ID    = Column(Integer, ForeignKey("KeywordMaster.Keyword_ID"), nullable=False)

    department = relationship("DepartmentMaster", back_populates="keyword_mapping")
    keyword    = relationship("KeywordMaster", back_populates="dept_assignments")


class DepartmentManagerMapping(Base):
    __tablename__ = "DepartmentManagerMapping"

    DMM_ID        = Column(Integer, primary_key=True, autoincrement=True)
    Department_ID = Column(Integer, ForeignKey("DepartmentMaster.Department_ID"), nullable=False)
    Head_ID       = Column(Integer, ForeignKey("TenderManagerMaster.Head_ID"), nullable=False)

    department = relationship("DepartmentMaster", back_populates="manager_mapping")
    manager    = relationship("TenderManagerMaster", back_populates="dept_mapping")


# ─── Transaction Tables ───────────────────────────────────────────────────────

class TenderDetails(Base):
    __tablename__ = "TenderDetails"

    Tender_ID            = Column(Integer, primary_key=True, autoincrement=True)
    Tender_NAME          = Column(String(500), nullable=False)
    Tender_Ref_Number    = Column(String(200), nullable=True)
    Tender_Summary       = Column(Text, nullable=True)          # 1-2 sentence AI summary for listing view
    Sector_ID            = Column(Integer, ForeignKey("SectorMaster.Sector_ID"), nullable=False)
    Portal_ID            = Column(Integer, ForeignKey("WhitelistPortalMaster.Portal_ID"), nullable=True)
    Tender_PUB_Date      = Column(DateTime, nullable=True)
    Deadline             = Column(DateTime, nullable=False)      # general / final submission deadline
    Clarification_Meeting_Date  = Column(DateTime, nullable=True)  # pre-bid clarification meeting
    Query_Submission_Deadline   = Column(DateTime, nullable=True)  # query/clarification submission cutoff
    Final_Submission_Deadline   = Column(DateTime, nullable=True)  # final bid submission (if different from Deadline)
    Participation_Status = Column(String(20), nullable=True)    # NOT_PARTICIPATED | PARTICIPATED | WON | LAPSED
    Tender_Status        = Column(String(20), nullable=True)    # NEW | MODIFIED
    Website_URL          = Column(Text, nullable=True)
    Keyword_JSON         = Column(Text, nullable=False)
    Score                = Column(Float, nullable=False, default=0)
    Indexed              = Column(Boolean, nullable=False, default=False)
    Chroma_ID            = Column(String(200), nullable=True)
    Issuing_Organisation = Column(String(300), nullable=False)
    Issuing_State        = Column(String(100), nullable=True)
    Description          = Column(Text, nullable=False)
    Source_Domain        = Column(String(200), nullable=False)
    Requirements_JSON    = Column(Text, nullable=True)           # classifier output (core/tender_requirements.py); NULL = not run
    Created_On           = Column(DateTime, nullable=False, server_default=func.now())

    sector        = relationship("SectorMaster", back_populates="tenders")
    portal        = relationship("WhitelistPortalMaster", back_populates="tenders", foreign_keys=[Portal_ID])
    qual_results  = relationship("QualificationResult", back_populates="tender")
    activity_logs = relationship("ActivityLog", back_populates="tender")
    token_logs    = relationship("AITokenUsageLog", back_populates="tender", foreign_keys="AITokenUsageLog.Tender_ID")


class ActivityLog(Base):
    __tablename__ = "ActivityLog"

    Log_ID           = Column(Integer, primary_key=True, autoincrement=True)
    Event_Type       = Column(String(50), nullable=False)
    Tender_ID        = Column(Integer, ForeignKey("TenderDetails.Tender_ID"), nullable=True)
    Department_ID    = Column(Integer, ForeignKey("DepartmentMaster.Department_ID"), nullable=True)
    Scraper_Agent_ID = Column(Integer, ForeignKey("ScraperAgentMaster.ScraperAgent_ID"), nullable=True)
    Status           = Column(String(20), nullable=False)   # SUCCESS | FAILED | SKIPPED
    Details_JSON     = Column(Text, nullable=False)
    Timestamp        = Column(DateTime, nullable=False, server_default=func.now())

    tender        = relationship("TenderDetails", back_populates="activity_logs")
    department    = relationship("DepartmentMaster", back_populates="activity_logs")
    scraper_agent = relationship("ScraperAgentMaster", foreign_keys=[Scraper_Agent_ID])


class QualificationResult(Base):
    __tablename__ = "QualificationResult"

    Result_ID              = Column(Integer, primary_key=True, autoincrement=True)
    Tender_ID              = Column(Integer, ForeignKey("TenderDetails.Tender_ID"), nullable=False)
    Department_ID          = Column(Integer, ForeignKey("DepartmentMaster.Department_ID"), nullable=False)
    Score                  = Column(Float, nullable=False)
    Verdict                = Column(String(20), nullable=False)   # ELIGIBLE | CONDITIONAL | INELIGIBLE
    Dimensions_JSON        = Column(Text, nullable=False)
    Gaps_JSON              = Column(Text, nullable=False)
    Strengths_JSON         = Column(Text, nullable=False)
    Recommendations_JSON   = Column(Text, nullable=False)
    Hard_Disqualifiers_JSON = Column(Text, nullable=False)
    Reasoning              = Column(Text, nullable=False)
    Evaluated_At           = Column(DateTime, nullable=False, server_default=func.now())

    tender     = relationship("TenderDetails", back_populates="qual_results")
    department = relationship("DepartmentMaster", back_populates="qual_results")


# ─── AI Token Usage Log ───────────────────────────────────────────────────────

class AITokenUsageLog(Base):
    """
    Tracks Gemini API token consumption per pipeline stage.
    Used by the /token-usage page to show cost breakdowns.
    """
    __tablename__ = "AITokenUsageLog"

    Usage_ID           = Column(Integer, primary_key=True, autoincrement=True)
    Stage              = Column(String(50),  nullable=False)   # SCRAPE | VALIDATE_FLASH | QUALIFY
    Model              = Column(String(100), nullable=False)   # gemini-1.5-flash | gemini-1.5-pro
    Input_Tokens       = Column(Integer, nullable=False, default=0)
    Output_Tokens      = Column(Integer, nullable=False, default=0)
    Estimated_Cost_USD = Column(Float,   nullable=False, default=0.0)
    Scraper_Agent_ID   = Column(Integer, ForeignKey("ScraperAgentMaster.ScraperAgent_ID"), nullable=True)
    Tender_ID          = Column(Integer, ForeignKey("TenderDetails.Tender_ID"), nullable=True)
    Timestamp          = Column(DateTime, nullable=False, server_default=func.now())

    scraper_agent = relationship("ScraperAgentMaster", back_populates="token_logs", foreign_keys=[Scraper_Agent_ID])
    tender        = relationship("TenderDetails", back_populates="token_logs", foreign_keys=[Tender_ID])
