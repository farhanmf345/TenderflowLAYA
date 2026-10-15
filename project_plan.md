# TenderFlow v4.0 Project Plan

This roadmap breaks down the remaining work to finish TenderFlow v4.0. It divides the system into simple modules (features). For each module, it lists what is being built right now to cover the core needs, the tasks to finish that core version, and what we can add in the future to make it even better.

---

## 1. Database Setup & Seeding

**What the feature is right now:**
We have a completely fresh, empty Azure PostgreSQL database. We need to fill it with basic mock data so the app has something to show when we connect it.
**Tasks (Detailed Breakdown):**
- Create a Python script (`seed_db.py`).
- Have the script safely connect to the database.
- Insert the master options: Sectors, Frequencies, and allowed Portals.
- Insert the 4 main Departments (e.g., "IT Services", "Cloud Solutions").
- Run the script once from the terminal to populate the database.
**In the future we can add deeper things:**
- Automated database migrations (tracking changes to columns automatically).
- A button in the settings to "Wipe and Reset Database".

---

## 2. Frontend & Backend Wiring (Connecting the App)

**What the feature is right now:**
The user interface looks complete, but the text and numbers on the screen are hardcoded. We need to connect them to the backend API so they read real data.
**Tasks (Detailed Breakdown):**
- Update the Dashboard page to load the active scraper agents from the API instead of a static list.
- Update the Departments page to fetch the newly created departments from the API.
- Create loading spinners so the user knows data is being fetched.
- Make sure that if a table is empty, a friendly message says "No data found."
**In the future we can add deeper things:**
- Real-time live updates (WebSockets) so the screen refreshes immediately when a tender is found in the background.

---

## 3. Microsoft SSO Authentication (Login)

**What the feature is right now:**
The login page is just a design. We need real administrators to be able to sign in securely using their existing Microsoft accounts.
**Tasks (Detailed Breakdown):**
- Configure the Azure App Registration for TenderFlow.
- Add the Microsoft credentials to the environment variables (`.env`).
- Hook up the login button to redirect to Microsoft and accept the secure token when the user returns.
- Make the backend verify this token before returning any private data.
**In the future we can add deeper things:**
- User Roles (e.g., standard viewers vs. administrators).
- A timeout automatic-logout feature for security.

---

## 4. Departments & Rules Engine

**What the feature is right now:**
Departments contain search keywords and strict eligibility rules (Criteria) that tell the AI which tenders to accept.
**Tasks (Detailed Breakdown):**
- Make the "Add Rule" button actually submit the `PRE_FILTER` or `QUAL_GATE` rule to the backend API.
- Ensure keywords typed into the UI correctly map to the database so the scraper bots know what to look for.
**In the future we can add deeper things:**
- Department budgeting (setting a financial limit per department).
- Allowing individual departments to override the main company's financial stats.

---

## 5. Scraper Configuration & Job Scheduler

**What the feature is right now:**
The Scraper Config page tells the bots *where* to look. The Scheduler page tells us *what* the bots are currently doing.
**Tasks (Detailed Breakdown):**
- Connect the "Add Portal" feature so it records a new scraping portal to the database.
- Wire the "Trigger Now" button on the Scheduler page so clicking it immediately starts a Python web-scraping task.
- Display a "Running" logo when a job is actively processing in the background.
**In the future we can add deeper things:**
- AI proxy rotation to stop portals from blocking our bots.
- Advanced retry rules if a government website is down.

---

## 6. Email Notifications

**What the feature is right now:**
When a tender passes all AI rules, the system needs to notify the assigned Tender Manager with a report.
**Tasks (Detailed Breakdown):**
- Design a clean, readable HTML email format that shows the Tender score and details.
- Connect the Python email sender (`smtplib`) using the credentials in the `.env` file.
- Automatically email the correct manager when a matching tender is processed.
**In the future we can add deeper things:**
- Quick-action buttons inside the email (e.g., "Click here to approve this tender").
- Weekly summary emails showing all tenders found that week.

---

## 7. AI Agent Pipeline (The Brain)

**What the feature is right now:**
The backend Python code that reads the tenders, spots duplicates, and grades them over 7 different categories based on the Company Profile.
**Tasks (Detailed Breakdown):**
- Hook up the Gemini API to format the scraped text into organized sections.
- Hook up the vector database (ChromaDB) to accurately flag if two tenders are mathematically identical.
- Finalize the grading logic (e.g., matching the company's past projects against the tender's requirements to give a score out of 100).
**In the future we can add deeper things:**
- Allowing the AI to write draft bidding documents automatically.
- Expanding the AI to suggest which missing certificates the company should get to win more tenders.
