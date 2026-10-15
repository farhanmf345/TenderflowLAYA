"""
Alembic env.py - TenderFlow v4.0
Configured for Azure Database for PostgreSQL via SQLAlchemy.

Fix: DB URL is passed via create_engine() directly (not through ConfigParser)
to avoid ValueError from % characters in URL-encoded passwords.
"""

import os
import sys
from logging.config import fileConfig

from sqlalchemy import create_engine, pool
from alembic import context

# ── Add server/ to Python path ────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Load app settings (reads .env) ───────────────────────────────────────────
from config.settings import settings

# ── Import ALL models so autogenerate can detect them ─────────────────────────
from core.database import Base
import core.models  # noqa: F401

# ── Alembic Config object ─────────────────────────────────────────────────────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ─── Offline mode ─────────────────────────────────────────────────────────────

def run_migrations_offline() -> None:
    context.configure(
        url=settings.db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ─── Online mode ──────────────────────────────────────────────────────────────

def run_migrations_online() -> None:
    # Create engine directly - avoids ConfigParser % interpolation issue
    connectable = create_engine(
        settings.db_url,
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
