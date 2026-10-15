from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import settings
from core.database import engine, Base

# Import all routers
from api.routers import (
    company, departments, sectors, criteria,
    portals, scraper_agents, keywords, managers,
    tenders, qualification, scheduler_router,
    activity, settings as settings_router,
    dashboard, token_usage, manager
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan - runs at startup and shutdown.
    1. Create all MySQL tables (idempotent: CREATE TABLE IF NOT EXISTS)
    2. Start APScheduler with jobs loaded from ScraperAgentMaster
    3. On shutdown: stop the scheduler gracefully
    """
    # Startup
    logger.info("[App] Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("[App] ✓ Database tables ready")

    from core.scheduler import start as scheduler_start
    scheduler_start()

    yield

    # Shutdown
    from core.scheduler import shutdown as scheduler_shutdown
    scheduler_shutdown()
    logger.info("[App] ⏹ Shutdown complete")


app = FastAPI(
    title="TenderFlow v4.0 API",
    description="AI-Powered Tender Intelligence Agent - Backend API",
    version="4.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS - allow React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all routers under /api prefix
app.include_router(company.router,          prefix="/api/company",         tags=["Company"])
app.include_router(departments.router,      prefix="/api/departments",     tags=["Departments"])
app.include_router(managers.router,         prefix="/api/managers",        tags=["Managers"])
app.include_router(sectors.router,          prefix="/api/sectors",         tags=["Sectors"])
app.include_router(criteria.router,         prefix="/api/criteria",        tags=["Criteria"])
app.include_router(portals.router,          prefix="/api/portals",         tags=["Portals"])
app.include_router(scraper_agents.router,   prefix="/api/scraper-agents",  tags=["Scraper Agents"])
app.include_router(keywords.router,         prefix="/api/keywords",        tags=["Keywords"])
app.include_router(tenders.router,          prefix="/api/tenders",         tags=["Tenders"])
app.include_router(qualification.router,    prefix="/api/qualification",   tags=["Qualification"])
app.include_router(scheduler_router.router, prefix="/api/scheduler",       tags=["Scheduler"])
app.include_router(activity.router,         prefix="/api/activity",        tags=["Activity Log"])
app.include_router(dashboard.router,        prefix="/api/dashboard",       tags=["Dashboard"])
app.include_router(settings_router.router,  prefix="/api/settings",        tags=["Settings"])
app.include_router(token_usage.router,      prefix="/api/token-usage",     tags=["Token Usage"])
app.include_router(manager.router,          prefix="/api/manager",          tags=["Manager Portal"])


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "app": "TenderFlow v4.0", "scheduler": "running"}
