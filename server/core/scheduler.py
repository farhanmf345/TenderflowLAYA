"""
APScheduler integration for TenderFlow v4.0

Reads all active ScraperAgentMaster records and schedules the ParentAgent
based on each agent's Freq_Config_JSON.

Freq_Config_JSON examples:
  {"type": "daily",      "time": "09:00"}
  {"type": "day_of_week","day": "Mon", "time": "08:30"}
  {"type": "weekly",     "time": "07:00"}
  {"type": "at_time",    "time": "06:30"}
  {"type": "interval",   "hours": 6}

Called from main.py lifespan:
  - scheduler.start()  on app startup
  - scheduler.shutdown() on app shutdown
"""

import asyncio
import json
import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron   import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from core.database import SessionLocal
from core.models import ScraperAgentMaster

logger = logging.getLogger(__name__)

# Global scheduler instance
_scheduler: Optional[AsyncIOScheduler] = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
    return _scheduler


def _parse_time(time_str: str):
    """Parse 'HH:MM' into (hour, minute)."""
    try:
        h, m = time_str.split(":")
        return int(h), int(m)
    except Exception:
        return 9, 0   # default 09:00


def _build_trigger(freq_config: dict):
    """
    Convert a Freq_Config_JSON dict into an APScheduler trigger.
    Returns a Trigger instance.

    FrequencyMaster DB values:   daily | dotw | weekly | monthly | attime | interval
    Old expected strings:        daily | day_of_week | weekly | monthly | at_time | interval
    """
    cfg_type = freq_config.get("type", "daily").lower()
    time_str = freq_config.get("time", "09:00")
    hour, minute = _parse_time(time_str)

    if cfg_type == "daily":
        return CronTrigger(hour=hour, minute=minute)

    # "dotw" = day of the week. DB stores days as a list e.g. ["Sat"] or a single str e.g. "Mon"
    if cfg_type in ("dotw", "day_of_week", "weekly"):
        days_val = freq_config.get("days") or freq_config.get("day", "mon")
        if isinstance(days_val, list):
            # APScheduler accepts comma-separated: "mon,wed,fri"
            day = ",".join(d[:3].lower() for d in days_val) if days_val else "mon"
        else:
            day = str(days_val)[:3].lower()
        return CronTrigger(day_of_week=day, hour=hour, minute=minute)

    if cfg_type == "monthly":
        # DB stores as "day" (string like "5"), APScheduler wants int
        day_of_month = int(freq_config.get("day") or freq_config.get("day_of_month") or 1)
        return CronTrigger(day=day_of_month, hour=hour, minute=minute)

    # "attime" = run once at a specific time each day (same as daily with a fixed time)
    if cfg_type in ("attime", "at_time"):
        return CronTrigger(hour=hour, minute=minute)

    if cfg_type == "interval":
        hours   = freq_config.get("hours", 24)
        minutes = freq_config.get("minutes", 0)
        return IntervalTrigger(hours=int(hours), minutes=int(minutes))

    # Fallback: daily at 09:00
    logger.warning(f"[Scheduler] Unknown freq type '{cfg_type}' - defaulting to daily 09:00")
    return CronTrigger(hour=9, minute=0)



async def _run_agent(scraper_agent_id: int):
    """Async task dispatched by APScheduler for each agent hit."""
    from agents.parent_agent import ParentAgent
    agent = ParentAgent()
    logger.info(f"[Scheduler] ▶ Firing ParentAgent for ScraperAgent_ID={scraper_agent_id}")
    try:
        await agent.run(scraper_agent_id=scraper_agent_id)
    except Exception as e:
        logger.error(f"[Scheduler] ParentAgent failed for ID={scraper_agent_id}: {e}", exc_info=True)


def load_jobs_from_db():
    """
    Read all active ScraperAgentMaster records and register APScheduler jobs.
    Can be called at startup AND after adding/updating agents via the API.
    """
    scheduler = get_scheduler()
    db = SessionLocal()

    try:
        agents = db.query(ScraperAgentMaster).filter_by(Is_Active=True).all()
        logger.info(f"[Scheduler] Loading {len(agents)} active scraper agent(s)")

        for agent in agents:
            job_id = f"scraper_agent_{agent.ScraperAgent_ID}"

            # Remove existing job if present (for reload scenarios)
            existing = scheduler.get_job(job_id)
            if existing:
                scheduler.remove_job(job_id)

            try:
                freq_config = json.loads(agent.Freq_Config_JSON or "{}")
            except json.JSONDecodeError:
                freq_config = {}

            trigger = _build_trigger(freq_config)
            portal_name = agent.portal.Portal_Name if agent.portal else "Unknown"

            scheduler.add_job(
                _run_agent,
                trigger=trigger,
                args=[agent.ScraperAgent_ID],
                id=job_id,
                name=f"Scraper - {portal_name}",
                replace_existing=True,
                misfire_grace_time=600,   # 10 min grace if scheduler was down
            )
            logger.info(
                f"[Scheduler] ✓ Registered job '{job_id}' - "
                f"Portal: {portal_name} | Freq: {freq_config}"
            )
    finally:
        db.close()


def start():
    """Start the scheduler and load all active agent jobs."""
    scheduler = get_scheduler()
    load_jobs_from_db()
    scheduler.start()
    logger.info("[Scheduler] ✅ APScheduler started")


def shutdown():
    """Gracefully stop the scheduler."""
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[Scheduler] ⏹ APScheduler stopped")


def reload_jobs():
    """Re-read DB and refresh all scheduled jobs. Call after API updates."""
    load_jobs_from_db()
    logger.info("[Scheduler] ♻ Jobs reloaded from DB")
