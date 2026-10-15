# TenderFlow v4.0 - System Context File                                 
> **Last Updated:** 2026-05-18 (Phase 2 — Deadline Timeline, Participation Status, Manager Portal)
> **Maintainer:** Admin (Sysfore Technologies)
> This file is the single source of truth for any AI agent, developer, or stakeholder working on TenderFlow v4.0. Keep it updated when schema, modules, or flows change.

---

## 1. System Overview

**TenderFlow** is an AI-powered government tender intelligence and eligibility qualification platform built for organisations that regularly participate in public procurement (GeM, eProcure, NIC, MeitY, etc.).

The platform automates:
1. **Scraping** tender portals on a configurable schedule (per-portal Scraper Agents, with Grounded Search Fallback for JS-rendered portals)
2. **Validating** scraped tenders (fingerprint dedup, Flash pre-check, ChromaDB dedup, freshness, whitelist, PRE_FILTER)
3. **Qualifying** each tender against the company's profile (7-dimension scoring)
4. **Notifying** department Tender Managers via Power Automate email workflow with eligibility reports

---

## 2. User & Auth Flow

| Step | Description |
|---|---|
| Login | Admin authenticates via **Microsoft Azure Active Directory (AD)** - SSO |
| First Login | Redirected to **Company Profile** to set up master data |
| Subsequent Logins | Redirected to **Dashboard** |
| Role | Single admin role per organisation (1 company = 1 admin) |
| Session | JWT token, stored in httpOnly cookie |

---

## 3. Module Map

| React Route | Page Component | Nav Label | Purpose |
|---|---|---|---|
| `/login` | `Login.jsx` | - | Microsoft AD SSO entry point |
| `/dashboard` | `Dashboard.jsx` | Dashboard | Live pipeline metrics, activity feed, scraper agent status |
| `/company-profile` | `CompanyProfile.jsx` | Company Profile | Master company data - inherited by all departments |
| `/scraper-config` | `ScraperConfig.jsx` | Scraper Config | Configure scraper agents per portal; live monitoring and manual triggers (consolidated from Scheduler); global scraper parameters |
| `/settings` | `AppSettings.jsx` | App Settings | Theme, email notification settings |
| `/tenders` | `TenderBrowser.jsx` | Tenders | View all scraped tenders with qualification results, deadline timeline, and participation status |
| `/departments` | `Departments.jsx` | Departments | Department CRUD: sector, validity, portals, keywords, criteria, past projects, tender history |
| `/token-usage` | `TokenUsage.jsx` | Token Usage | AI token consumption per pipeline stage + estimated cost |
| `/manager` | `TenderManager/` | Manager Portal | Full CRUD portal for Tender Managers — view assigned tenders, edit department description/projects/keywords/history/rules (create/delete department is Admin-only) |

> **Note:** The old `/scheduler` route was removed, and its functionality (monitoring, triggering) has been merged into `/scraper-config`.

---

## 4. Data Architecture - Inheritance Model

```text
CompanyMaster (Company)
  ├── Annual_Turnover_Cr, Net_Worth_Cr, Current_Ratio  ← inherited by ALL departments
  ├── Years_Of_Operation, Key_Personnel_Count           ← inherited by ALL departments
  ├── Is_MSME, Is_Startup, Is_Women_Led                 ← inherited by ALL departments
  ├── Max_Concurrent_Scrapes                            ← GLOBAL scraper limit
  ├── Scrape_Gap_Sec                                    ← GLOBAL scraper gap
  ├── Max_Retries                                       ← GLOBAL retry limit
  ├── Retry_Interval_Sec                                ← GLOBAL retry interval
  ├── [CompanyCertificateMapping]                       ← certs the company holds
  ├── [ProfileStateMapping]                             ← registered states
  └── [ProfileEquipmentMapping]                         ← assets/equipment

DepartmentMaster (per Department)
  ├── Dept_Name, Dept_Code, Description
  ├── Sector_ID                          ← FK → SectorMaster
  ├── Valid_From, Valid_To, Is_Active (computed)
  ├── [DepartmentPortalMapping]          ← which portals this dept monitors
  ├── [DepartmentKeywordMapping]         ← keywords for this department
  ├── [DepartmentProjectMapping]         ← past projects (dept-scoped experience)
  ├── [DepartmentTenderHistory]          ← previous tenders the dept participated in
  ├── [ParticipationCriteriaMaster]      ← PRE_FILTER + QUAL_GATE rules
  ├── [DepartmentManagerMapping]         ← junction to TenderManagerMaster
  └── [TenderManagerMaster]             ← who receives email alerts
```

**Rule:** Company Profile = shared master. Department = operational unit with its own sector, validity, portals, keywords, and past projects.

---

## 5. Module Details

### 5.1 Company Profile

**Fields (CompanyMaster table):**

| Field | Type | Notes |
|---|---|---|
| Company_Name | Text | Master name |
| Company_Description | Textarea | Used by AI agents as context |
| Annual_Turnover_Cr | Decimal | Inherited by all depts |
| Net_Worth_Cr | Decimal | Inherited |
| Current_Ratio | Decimal | Inherited |
| Years_Of_Operation | Integer | Inherited |
| Key_Personnel_Count | Integer | Inherited |
| Is_MSME / Is_Startup / Is_Women_Led | Checkbox | DEI flags |
| Certifications | Multiselect | Options from `CertificateMaster`; stored in `CompanyCertificateMapping` |
| Registered_States | Multiselect | All Indian states; stored in `ProfileStateMapping` |
| Equipment_Assets | Dynamic list | Asset name + qty (stored as `name||qty`); in `ProfileEquipmentMapping` |
| **Max_Concurrent_Scrapes** | Integer | Global scraper limit |
| **Scrape_Gap_Sec** | Float | Global scraper gap |
| **Max_Retries** | Integer | Global retry limit |
| **Retry_Interval_Sec** | Float | Global retry interval |

### 5.2 Departments

| Field | Type | Notes |
|---|---|---|
| Dept_Name | Text | |
| Dept_Code | Text | Auto-suggested, editable |
| Sector_ID | Dropdown | FK → `SectorMaster` |
| Valid_From / Valid_To | Date | |
| Is_Active | Computed | `today BETWEEN Valid_From AND Valid_To` |
| Portals | Multiselect | Options from `WhitelistPortalMaster`; stored in `DepartmentPortalMapping` |
| Keywords | Tag input | Stored in `DepartmentKeywordMapping` |
| Tender_Managers | Multiselect | Options from `TenderManagerMaster`; stored in `DepartmentManagerMapping` |
| Participation Criteria | Rules list | PRE_FILTER + QUAL_GATE; stored in `ParticipationCriteriaMaster` |
| Past Projects | Dynamic list | Project metadata for experience scoring; stored in `DepartmentProjectMapping` |
| Tender History | Dynamic list | Previous tender bids (WON/LOST/etc.); stored in `DepartmentTenderHistory` |

### 5.3 Scraper Config & Scheduling (Merged)

#### A. Global Scraper Parameters
Stored in `CompanyMaster`. Fetched/updated via `GET/PUT /api/scheduler/globals`.

| Parameter | Default | Notes |
|---|---|---|
| Max_Concurrent_Scrapes | 2 | Hard limit - validated on new agent creation |
| Scrape_Gap_Sec | 10 | Min delay between requests |
| Max_Retries | 2 | Retries before logging FAILED |
| Retry_Interval_Sec | 60 | Wait between retries |

#### B. Scraper Agents (per portal)
Created in Scraper Config page. Each agent runs on APScheduler.

| Field | Type | Notes |
|---|---|---|
| Portal | Dropdown | From `WhitelistPortalMaster` |
| Linked Departments | Auto-derived chips | From `DepartmentPortalMapping` |
| Combined Keywords | Auto-derived chips | Union of `DepartmentKeywordMapping` for all linked depts |
| Frequency Type | Dropdown | daily / dotw / weekly / monthly / attime |
| Is_Active | Dropdown | Yes / No |

#### C. Live Monitoring & Triggering
Integrated into Scraper Config page.
- Shows live status per scraper agent: **Running / Active / Inactive**
- Shows: Last Run timestamp, Next Run, tenders found/stored
- **Trigger Now** button: immediate manual run
- **Deactivate/Activate** button
- Recent pipeline run log from `ActivityLog`

### 5.4 Participation Criteria

```text
[Scrape] → [PRE_FILTER] → discard? → [Qualify] → [QUAL_GATE] → suppress? → [Email]
```

| Criteria_Type | Applied By | Action on Fail |
|---|---|---|
| `PRE_FILTER` | Scraper Agent (embedded) + Validator Agent | Tender **discarded** (not scored) |
| `QUAL_GATE` | Parent Agent | Tender **stored** but email **suppressed** |

PRE_FILTER fields: `org_type`, `issuing_state`, `tender_value_cr`, `deadline_days_remaining`, `source_portal`
QUAL_GATE fields: `total_score`, `verdict`, `financial_score`, `cert_score`, etc.

### 5.5 Tender Browser

- Lists all validated tenders with filters: verdict, portal, date, department, search
- Status tabs: **Active** | **Lapsed** | **Participated** | **Won**
- Expandable row shows:
  - `Tender_Summary` — highlighted callout block
  - **Deadline Timeline** — Pre-Bid Meeting, Query Submission Deadline, Final Submission Deadline
  - 7-dimension score breakdown (best matching department)
  - Gaps, Strengths, Subject Fails
  - **Participation Status** — mark as: PARTICIPATED | WON | NOT_PARTICIPATED

### 5.6 Participation Status Flow

```text
Tender stored (Participation_Status = NULL)
  │
  ▼
Admin opens TenderBrowser, tender is Active
  │
  ├── PARTICIPATED  → Admin marked as bid
  ├── WON           → Admin marked as won
  └── NOT_PARTICIPATED (default; Admin can reset)

LAPSED is set automatically when deadline passes (status tab filter only)
```

Values: `NOT_PARTICIPATED | PARTICIPATED | WON | LAPSED`
Stored as: `VARCHAR(20)` in `TenderDetails.Participation_Status`
API: `PATCH /api/tenders/{tender_id}/status`

### 5.6 App Settings

| Setting | Notes |
|---|---|
| Theme | Light / Dark mode toggle |
| Email From Name | Sender name in notification emails |
| Reply-To Address | Email reply-to |
| Send Test Email | Validates Power Automate webhook config |

### 5.7 Token Usage

Displays AI token consumption per pipeline stage and estimated cost.

Data source: `AITokenUsageLog` table.
- Stage: `SCRAPE | VALIDATE_FLASH | QUALIFY`
- Model: `gemini-1.5-flash | gemini-1.5-pro` (or 2.5 equivalent depending on config)

---

## 6. Database Schema

### Master / Lookup Tables

| Table | Key Fields | Notes |
|---|---|---|
| **CompanyMaster** | Company_ID, Company_Name, Valid_From, Valid_To, Is_Active, Annual_Turnover_Cr, Net_Worth_Cr, Current_Ratio, Years_Of_Operation, Key_Personnel_Count, Is_MSME, Is_Startup, Is_Women_Led, **Max_Concurrent_Scrapes, Scrape_Gap_Sec, Max_Retries, Retry_Interval_Sec, ChromaDB_Dedup_Threshold**, Created_On, Updated_On | Global scraper params + ChromaDB threshold added |
| **DepartmentMaster** | Department_ID, Department_Name, **Dept_Code**, Valid_From, Valid_To, Sector_ID, Description, Created_On, Updated_On | Dept_Code added (was incorrectly mapped to Description) |
| **SectorMaster** | Sector_ID, Sector_Name, Is_Active, Created_On | |
| **ParticipationCriteriaMaster** | Criteria_ID, Department_ID, Criteria_Type (PRE_FILTER\|QUAL_GATE), Target_Field, Operator, Target_Value, **Action** (Discard\|Accept), Is_Active, Created_On, Updated_On | Action field added for Discard/Accept rule intent |
| **TenderManagerMaster** | Head_ID, Head_Name, Email, Is_Active, Created_On | Mapped via DepartmentManagerMapping |
| **KeywordMaster** | Keyword_ID, Keyword, Sector_ID | |
| **CertificateMaster** | Certificate_ID, Certificate_NAME, Description | |
| **StateMaster** | State_ID, State_Name, State_Code | |
| **WhitelistPortalMaster** | Portal_ID, Portal_Name, Base_URL | |
| **FrequencyMaster** | Freq_ID, Freq_Type | |
| **ScraperAgentMaster** | ScraperAgent_ID, Portal_ID, Freq_ID, Freq_Config_JSON, Is_Active | Global params removed from here |

### Mapping Tables

| Table | Fields | Notes |
|---|---|---|
| **CompanyCertificateMapping** | CCM_ID, Company_ID, Certificate_ID | Certs the company holds |
| **SectorCertificateMapping** | SCM_ID, Sector_ID, Certificate_ID, Is_Mandatory | |
| **ProfileEquipmentMapping** | PEM_ID, Equipment_NAME, Company_ID | Stored as `name\|\|qty` |
| **ProfileStateMapping** | PSM_ID, State_ID, Company_ID | |
| **DepartmentPortalMapping** | DPM_ID, Department_ID, Portal_ID | |
| **DepartmentKeywordMapping** | DKM_ID, Department_ID, Keyword_ID | |
| **DepartmentManagerMapping** | DMM_ID, Department_ID, Head_ID | Junction table |
| **DepartmentProjectMapping** | DPrM_ID, Department_ID, Project_Title, Client_Name, Value_Cr, Completion_Year, Duration_Months, Sector_Name, Description, Keywords_JSON, Cert_Issued, Created_On | Dept-level past projects |

### Transaction Tables

| Table | Key Fields | Notes |
|---|---|---|
| **TenderDetails** | Tender_ID, Tender_NAME, Tender_Ref_Number, Tender_Summary, Issuing_Organisation, Issuing_State, Sector_ID, Portal_ID, Tender_PUB_Date, Deadline, **Clarification_Meeting_Date**, **Query_Submission_Deadline**, **Final_Submission_Deadline**, **Participation_Status**, Website_URL, Keyword_JSON, Score, Indexed, Chroma_ID, Source_Domain, Description, Created_On | Phase 2: summary, deadline stages, participation status added |
| **QualificationResult** | Result_ID, Tender_ID, Department_ID, Score, Verdict, Dimensions_JSON, Gaps_JSON, Strengths_JSON, Recommendations_JSON, Hard_Disqualifiers_JSON, Reasoning, Evaluated_At | |
| **ActivityLog** | Log_ID, Event_Type, Tender_ID, Department_ID, Scraper_Agent_ID, Status, Details_JSON, Timestamp | Agent ID added for traceability |
| **AITokenUsageLog** | Usage_ID, Stage, Model, Input_Tokens, Output_Tokens, Estimated_Cost_USD, Scraper_Agent_ID, Tender_ID, Timestamp | Token tracking for cost monitoring |

---

## 7. Agent System

### 7.1 Pipeline Flow

```text
CompanyMaster (Global Params: Max_Concurrent, Gap, Retries)
  │
  ▼
APScheduler (one job per active ScraperAgentMaster)
  │
  ▼
ParentAgent.run(scraper_agent_id)
  ├── Enforce concurrency semaphore (≤ Max_Concurrent_Scrapes active at once)
  ├── Load ScraperAgentMaster → Portal, DepartmentPortalMapping, PRE_FILTER criteria
  ├── Instantiate agents/scraper_agent.py (ScraperAgent class)
  │     ├── Aggregate keywords from linked departments
  │     ├── Fetch portal page (httpx, with retries)
  │     ├── Gemini extraction → List[RawTender]
  │     └── Apply PRE_FILTER criteria
  ├── ValidatorAgent.validate(raw_tender) for each tender
  │     ├── [1] Flash Pre-check (Gemini Flash): "Is this new or duplicate?"
  │     ├── [2] Structured Fingerprint Check (PostgreSQL): issuing_org + tender_ref + deadline
  │     ├── [3] ChromaDB cosine similarity dedup (< 0.96 threshold)
  │     ├── [4] Freshness check (deadline ≥ 3 days)
  │     ├── [5] Whitelist check (portal in WhitelistPortalMaster)
  │     ├── [6] PRE_FILTER rules (ParticipationCriteriaMaster)
  │     ├── [7] Generate Tender_Summary via Gemini Flash (non-blocking, 1-sentence)
  │     └── [8] Write to PostgreSQL (TenderDetails) + ChromaDB
  ├── QualifierAgent.qualify(tender_id, dept_id) per linked department
  │     ├── 7-dimension scoring vs CompanyMaster + DepartmentMaster
  │     └── Store QualificationResult
  ├── Apply QUAL_GATE rules (ParticipationCriteriaMaster)
  └── Email TenderManagers via Power Automate → Log → AITokenUsageLog
```

### 7.2 Agent Files & Responsibilities

| Agent | File(s) | Core Job |
|---|---|---|
| **Parent Agent** | `agents/parent_agent.py` | Orchestrator - full pipeline, concurrency control |
| **Scraper Agent** | `agents/scraper_agent.py` | Fetches portal, extracts via Gemini. Note: No more auto-generated `agent_{id}.py` files. |
| **Base Scraper** | `agents/ScraperAgents/base_scraper.py` | Legacy base scraper logic / fallback |
| **Validator Agent** | `agents/validator_agent.py` | Flash pre-check, fingerprint, ChromaDB dedup, freshness, whitelist |
| **Qualifier Agent** | `agents/qualifier_agent.py` | 7-dimension eligibility scoring |

### 7.2b Tender Requirement Classifier (optional, off by default)

`server/core/tender_requirements.py` reads each tender's text when the Validator saves it and answers fixed yes/no
questions about what the tender itself demands: required certificates (one question per `CertificateMaster` row),
bank guarantee, EMD, state restriction, local presence, MSME / startup / women preference.

- Output: probabilities, stored in `TenderDetails.Requirements_JSON` (NULL = not run). Migration `b4e2a91c7d30`.
- Backends via `REQUIREMENTS_BACKEND`: `off` (default) | `laya` (local Laya model, `pip install laya`) | `gemini`.
- `REQUIREMENTS_CONFIDENCE` (default 0.7): answers at or above it count as "yes" in the API and UI.
- Best-effort: any failure stores the tender without requirements; the pipeline never fails because of it.
- It does **not** change any dimension score, verdict or email rule (phase 1). Next phase: feed `required_certificates`
  into the Certifications dimension and `state_restricted` into Geographic, after checking accuracy on real tenders.
- API: `GET /api/tenders/browser` returns `requirements` per tender; Tender Browser shows them as small tags.
- Tests: `server/tests/test_tender_requirements.py` (fake backend, no model needed).

### 7.3 Duplicate Detection - 3-Layer Strategy

| Layer | Method | Cost | When |
|---|---|---|---|
| 1 | **Flash Pre-check** (Gemini) | Very low | Before any DB write. Send title + snippet → "New or duplicate?" |
| 2 | **Structured Fingerprint** (PostgreSQL) | Zero | Check `issuing_org + tender_ref_number + deadline` composite key |
| 3 | **ChromaDB Cosine Similarity** | Medium | Embed full text, query ChromaDB, flag if similarity ≥ 0.92 |

### 7.4 Scoring Dimensions

| Dimension | Weight | Data Source |
|---|---|---|
| Financial Capability | 25 pts | CompanyMaster (turnover, net worth, current ratio) |
| Sector Experience | 20 pts | **DepartmentProjectMapping** (dept-level; matches on `Project_Title` + `Keywords_JSON`) |
| Certifications & Registrations | 20 pts | CompanyCertificateMapping vs SectorCertificateMapping |
| Technical Capability | 15 pts | ProfileEquipmentMapping |
| Legal & Compliance | 10 pts | CompanyMaster (valid dates, active status) |
| Geographic Match | 5 pts | ProfileStateMapping vs Tender.Issuing_State |
| DEI Bonus | 5 pts | Is_MSME, Is_Startup, Is_Women_Led |

**Verdict thresholds:** ELIGIBLE ≥ 60 | CONDITIONAL 40–59 | INELIGIBLE < 40  
**Hard disqualifier:** Any `SectorCertificateMapping.Is_Mandatory = TRUE` cert missing → auto INELIGIBLE.

---

## 8. API Endpoints (FastAPI)

| Prefix | Router File | Key Endpoints |
|---|---|---|
| `/api/company` | `company.py` | GET/POST/PUT profile; PUT equipment/states/certifications |
| `/api/departments` | `departments.py` | CRUD departments; POST/DELETE portals & keywords per dept; GET/PUT projects; GET/PUT tender history |
| `/api/managers` | `managers.py` | CRUD tender managers |
| `/api/sectors` | `sectors.py` | GET all sectors |
| `/api/criteria` | `criteria.py` | CRUD participation criteria |
| `/api/portals` | `portals.py` | GET/POST portals |
| `/api/scraper-agents` | `scraper_agents.py` | CRUD scraper agents |
| `/api/keywords` | `keywords.py` | GET/POST keywords |
| `/api/tenders` | `tenders.py` | GET tenders list; GET /browser (with qual results + Phase 2 fields); PATCH /{id}/status |
| `/api/qualification` | `qualification.py` | GET qualification results |
| `/api/scheduler` | `scheduler_router.py` | GET/PUT globals (Max_Concurrent, Scrape_Gap_Sec, Max_Retries, Retry_Interval_Sec, **ChromaDB_Dedup_Threshold**); trigger/pause/activate agents; run-log |
| `/api/activity` | `activity.py` | GET activity log |
| `/api/dashboard` | `dashboard.py` | GET stats, trend |
| `/api/settings` | `settings.py` | GET/PUT email settings |
| `/api/token-usage` | `token_usage.py` | GET usage log; GET summary by stage/model |
| `/api/manager` | `manager.py` | GET /all (managers+depts); GET /tenders (for manager portal - full Phase 2 fields) |

---

## 9. Technology Stack

| Category | Technology | Purpose |
|---|---|---|
| Core Language | Python 3.10+ | Backend, agent pipeline |
| Web Framework | FastAPI | Async API routing |
| Frontend | React + Vite | Component-based UI |
| Relational DB | **Azure Database for PostgreSQL** | Structured storage (masters, logs, results); hosted on Azure, accessed via `postgresql+psycopg2` with SSL |
| ORM | SQLAlchemy | DB mapping |
| Vector DB | ChromaDB | Cosine-similarity dedup + RAG |
| Embedding Model | SentenceTransformers (`all-MiniLM-L6-v2`) | Text vectorization |
| AI / LLM | Google Gemini API (google-genai SDK) | Scraping extraction, Qualifier scoring |
| AI / Pre-check | Gemini 1.5 Flash / 2.5 Pro | Duplicate pre-screening |
| Authentication | MSAL | Azure AD SSO |
| Task Scheduling | APScheduler (AsyncIOScheduler) | Scheduled jobs |
| HTTP Client | httpx | Async portal fetching |
| Email Notifications | **Power Automate Webhook (HTTP POST)** | Sending alerts via cloud flow (replaced `smtplib`) |

---

## 10. File Structure (Actual)

```text
TenderFlow-v4.0/
├── client/                          ← React + Vite frontend
│   └── src/
│       ├── App.jsx                  ← React Router (all routes)
│       ├── pages/
│       │   ├── Login.jsx, Dashboard.jsx, CompanyProfile.jsx
│       │   ├── Departments.jsx, ScraperConfig.jsx, TenderBrowser.jsx
│       │   ├── AppSettings.jsx, TokenUsage.jsx
│       ├── components/
│       │   ├── layout/              ← PageWrapper, Sidebar, Header
│       │   └── ui/                  ← Badge, ConfirmDialog, EmptyState, Modal, MultiCombobox, RefreshBar, Spinner, StatCard, TagInput
│
└── server/                          ← FastAPI backend
    ├── main.py                      ← App entry, lifespan, router mounts
    ├── config/settings.py           ← Env vars
    ├── core/
    │   ├── models.py                ← SQLAlchemy ORM models
    │   ├── database.py              ← SessionLocal, engine, Base
    │   ├── scheduler.py             ← APScheduler integration
    │   ├── chroma_client.py         ← ChromaDB singleton
    │   ├── scoring.py               ← Scoring dataclasses + weights
    │   └── email_service.py         ← Power Automate POST requests
    ├── agents/
    │   ├── parent_agent.py          ← Pipeline orchestrator
    │   ├── validator_agent.py       ← Validation pipeline
    │   ├── qualifier_agent.py       ← 7-dimension scoring
    │   ├── scraper_agent.py         ← Unified Scraper Agent
    │   └── ScraperAgents/           
    │       ├── base_scraper.py      ← Reusable base functions
    │       └── __init__.py          
    ├── api/routers/                 ← 16 router files
    └── schemas/                     ← 6 schema files
```

---

## 11. Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Scheduler Consolidation | **Merged into ScraperConfig** | Reduces navigation overhead; unified dashboard for configuring and monitoring agents |
| Global scraper params | **CompanyMaster** | Single source of truth; enforces company-wide limits |
| Email Service | **Power Automate Webhook** | Relies on robust cloud workflow via HTTP POST instead of fragile `smtplib` |
| Agent file structure | **Unified `scraper_agent.py`** | No longer generating per-agent Python files. `ScraperAgent` reads config directly. |
| Dedup order | **Flash → Fingerprint → ChromaDB** | Cheapest checks first; saves tokens and DB writes |
| Tender_Ref_Number | **TenderDetails** column | Enables composite fingerprint without Gemini |
| Token usage tracking | **AITokenUsageLog table** | Per-stage cost visibility |
| Sector field location | **DepartmentMaster** | A company can participate in multiple sectors via different depts |
| Past Projects | **DepartmentProjectMapping** | Experience tracking is scoped to individual departments, not company-wide |
| Participation_Status | **VARCHAR(20) on TenderDetails** | Simple admin-set flag; not a DB enum for flexibility (NOT_PARTICIPATED, PARTICIPATED, WON, LAPSED) |
| Tender Summary | **Tender_Summary TEXT on TenderDetails** | 1–2 sentence AI summary; surfaced in listing view and email header |
| Deadline Timeline | **3 separate DateTime columns** | Clarification_Meeting_Date, Query_Submission_Deadline, Final_Submission_Deadline on TenderDetails; shown in email + browser expanded row |

---

## 12. Known Bugs / Issues Found During Review

| # | Location | Issue | Fix Needed | Status |
|---|---|---|---|---|
| 1 | `agents/ScraperAgents/base_scraper.py` | `BaseScraper.__init__` was reading `Scrape_Gap_Sec`, `Max_Retries`, `Retry_Interval_Sec` from `agent_record` instead of `CompanyMaster` | Fixed: lines 160-164 now query `CompanyMaster.first()` and read global params from it | ✅ Fixed |
| 2 | `core/scoring.py` | Uses `field()` from `dataclasses` inside Pydantic `BaseModel` | Replace with `Field()` from `pydantic` | ✅ Fixed |
| 3 | `agents/validator_agent.py` | Calls `self.qualifier.qualify(...)` without `await` | Add `await` | ✅ Fixed |
| 4 | `api/routers/scheduler_router.py` | `GET /globals` reads from first ScraperAgentMaster row | Read from CompanyMaster instead | ✅ Fixed |

---

## 13. Open Questions / To-Do

- [ ] **Microsoft AD integration** - confirm Azure App Registration + redirect URIs
- [ ] **Gemini Flash cost rates** - confirm per-token pricing for cost estimation in Token Usage page
- [ ] **Multi-company support** - deferred to v5
- [ ] **Scoring Engine narrative** - Qualifier agent generates `Reasoning` text per result; see `scoring_engine.md` for full 7-dimension spec

---

*This file must be updated whenever a module, schema table, field, agent, or design decision changes.*
