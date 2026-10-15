# TenderFlow v4.0

> AI-Powered Tender Intelligence Agent - Full-Stack Platform

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+**
- **Node.js 20+**
- **MySQL 8.0+**
- **Google Gemini API Key**

---

### 1. Clone & Set Up Backend

```powershell
# Navigate to server directory
cd server

# Install Python dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
copy .env.example .env
# Edit .env with your MySQL credentials and Gemini API key
```

### 2. Set Up Frontend

```powershell
cd client
npm install
```

### 3. Set Up Database

Create MySQL database:
```sql
CREATE DATABASE tenderflow_v4 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Tables are **auto-created** from SQLAlchemy models on first server start (no migrations needed for dev).

### 4. Start Development Servers

**Option A** - Double-click `start_dev.bat` (Windows)

**Option B** - Manual:
```powershell
# Terminal 1 - Backend
cd server
uvicorn main:app --reload --port 8000

# Terminal 2 - Frontend
cd client
npm run dev
```

- **Frontend**: http://localhost:5173  
- **Backend API**: http://localhost:8000  
- **API Docs (Swagger)**: http://localhost:8000/docs

---

## 📁 Project Structure

```
TenderFlow-v4.0/
├── client/                    React + Vite frontend
│   └── src/
│       ├── pages/             All 8 app pages
│       ├── components/
│       │   ├── layout/        Sidebar, Header, PageWrapper
│       │   └── ui/            Badge, Modal, MultiCombobox, etc.
│       ├── lib/               API client, hooks, utils
│       └── styles/            global, layout, components, forms, animations
│
├── server/                    FastAPI backend
│   ├── agents/                AI pipeline agents
│   │   ├── scraper_agent.py   Gemini-powered web scraping
│   │   ├── validator_agent.py Dedup + PRE_FILTER + ChromaDB write
│   │   ├── qualifier_agent.py 7-dimension scoring + QUAL_GATE + email
│   │   └── parent_agent.py    Pipeline orchestrator
│   ├── api/routers/           13 FastAPI routers
│   ├── core/
│   │   ├── models.py          SQLAlchemy ORM (all 18 tables)
│   │   ├── database.py        MySQL engine + session
│   │   ├── chroma_client.py   ChromaDB dedup
│   │   ├── scheduler.py       APScheduler integration
│   │   ├── scoring.py         7-dimension weights + verdicts
│   │   └── email_service.py   HTML email via smtplib
│   ├── schemas/               Pydantic request/response models
│   ├── config/settings.py     Pydantic settings (.env loader)
│   └── main.py                FastAPI app factory + lifespan
│
├── tenderflow_context.md      Single source of truth - DB schema, modules
└── start_dev.bat              Windows one-click dev server launcher
```

---

## 🤖 Agent Pipeline

```
APScheduler (cadence from ScraperAgentMaster.Freq_Config_JSON)
    │
    ▼
ParentAgent.run(scraper_agent_id)
    │
    ▼ scrape()
ScraperAgent  ──► httpx fetch portal ──► Gemini entity extraction ──► List[RawTender]
    │
    ▼ validate() [per RawTender]
ValidatorAgent
    ├── ChromaDB dedup check
    ├── Freshness check  (deadline ≥ 3 days)
    ├── Whitelist check  (WhitelistPortalMaster)
    ├── PRE_FILTER rules (ParticipationCriteriaMaster per Department)
    └── MySQL write + ChromaDB embedding
    │
    ▼ qualify() [per Department linked to portal]
QualifierAgent
    ├── 7-Dimension scoring (CompanyMaster + DepartmentMaster)
    │   Financial · Experience · Certifications · Technical
    │   Legal · Geographic · DEI Bonus
    ├── QUAL_GATE rules (suppress email if gates not met)
    ├── QualificationResult → MySQL
    └── HTML email → TenderManagerMaster
```

---

## ⚙️ Scraper Freq_Config_JSON Examples

```json
{"type": "daily",       "time": "09:00"}
{"type": "day_of_week", "day": "Mon",   "time": "08:30"}
{"type": "weekly",      "time": "07:00"}
{"type": "interval",    "hours": 6}
{"type": "at_time",     "time": "06:30"}
```

---

## 🔑 Environment Variables

| Variable | Description |
|---|---|
| `DB_URL` | MySQL connection string |
| `GEMINI_API_KEY` | Google Gemini API key |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP port (usually 587) |
| `SMTP_USER` | SMTP username / email |
| `SMTP_PASSWORD` | SMTP app password |
| `CHROMA_PATH` | ChromaDB persistence path |
| `CORS_ORIGINS` | Allowed origins (comma-separated) |

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Lucide Icons |
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic 2 |
| Database | MySQL 8 |
| AI / LLM | Google Gemini 1.5 Flash |
| Vector DB | ChromaDB + sentence-transformers (all-MiniLM-L6-v2) |
| Scheduler | APScheduler 3.x (AsyncIO) |
| Email | Python smtplib (stdlib) |


### Laya AI in qualification scoring

TenderFlow can use the local Laya decision model to classify tender-side requirements across all seven qualifier dimensions: financial strength, domain experience, technical capability, certifications and registrations, legal standing, geographic alignment, and DEI. The resulting requirement signals are stored in `TenderDetails.Requirements_JSON` and included in dimension notes; detected tender-required certificates are also used as the primary certificate-match set. The existing deterministic profile-based point formulas, weights, subject-fail thresholds, hard-disqualification rules, and verdict thresholds remain authoritative. Laya signals are probabilistic and should be validated against real tenders; a low probability means “not detected,” not proof that a requirement is absent.

Set `REQUIREMENTS_BACKEND=laya` in `server/.env` to enable it (`laya` is now the default). The first Laya call may download a large model checkpoint. Use `REQUIREMENTS_BACKEND=off` to disable it, or `gemini` to use the existing Gemini classifier instead.

## Laya-assisted qualification scoring

When `REQUIREMENTS_BACKEND=laya`, TenderFlow classifies tender-side requirement signals and stores evidence in `Requirements_JSON`. For scoring, Laya assesses only **Domain Experience (40 points)** and **Technical Capability (35 points)** using fixed rubric criteria. Python maps each criterion's classifier signal to a label—Strong (>= 0.75), Partial (>= 0.45), or Not demonstrated (< 0.45)—and maps that label to fixed points. Financial Strength, Certifications & Registrations, Legal Standing, Geographic Alignment, and DEI Bonus are scored by deterministic Python rules. Laya can identify tender-required certificates, but Python matches them to company-held records and calculates certificate points.

Python remains authoritative for score aggregation, hard disqualifiers, per-factor minimum thresholds, verdict selection, `QUAL_GATE` rules, and email gating. The current dimension ceilings sum to 190 points, so aggregation is normalized onto the existing 200-point verdict scale. Laya classifier signals are not calibrated probabilities; missing evidence is not proof of non-compliance. If rubric scoring fails, the qualifier falls back to the existing Python scoring for the two Laya-owned factors.

## Laya full-tender evidence pass (October 2026)

When Laya scoring is enabled, the qualifier builds tender evidence from the stored tender title/description, the public tender landing page in `Website_URL` (when reachable), and up to five linked PDF attachments on the same host. Searchable PDF text is extracted with PyMuPDF. The complete collected text is scanned for clauses relevant to Domain Experience and Technical Capability; tender-side requirement classification may separately identify certificate and other mandatory requirements. The final verdict and hard-disqualifier handling remain in Python.

Safety/reliability notes: page/PDF fetching is bounded by time and file size, private/local URLs are rejected, only same-host PDF links are followed, and fetch failures fall back to the stored description. Image-only/scanned PDFs are not OCR'd by this change; OCR would need to be added separately. Verify that the source portal exposes its attachments as same-host links. The database's saved `Description` alone cannot guarantee a complete tender if the source website or PDF is inaccessible.

Validation performed in this change: Python compile check passed; 13 focused tests passed (`test_tender_document_reader.py`, `test_laya_qualification.py`, `test_tender_requirements.py`). Live portal fetching and Azure database integration were not tested here.
