from urllib.parse import parse_qs, urlparse

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config.settings import settings


def _build_connect_args(db_url: str) -> dict:
    """psycopg2 connect_args — SSL only for Azure or when the URL already requests it."""
    parsed = urlparse(db_url)
    host = (parsed.hostname or "").lower()
    query = parse_qs(parsed.query)

    connect_args: dict = {"connect_timeout": 10}

    if "sslmode" in query:
        connect_args["sslmode"] = query["sslmode"][0]
        return connect_args

    if "postgres.database.azure.com" in host or host.endswith(".azure.com"):
        connect_args["sslmode"] = "require"

    return connect_args


engine = create_engine(
    settings.db_url,
    pool_pre_ping=True,   # discard stale pooled connections before use
    pool_recycle=300,     # recycle before Azure idle disconnect (~4–10 min)
    pool_size=10,
    max_overflow=10,
    pool_timeout=30,
    connect_args=_build_connect_args(settings.db_url),
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a DB session and closes it after request.

    Stale-connection recovery is handled by pool_pre_ping on the engine; no retry
    wrapper is needed for typical Azure PostgreSQL SSL EOF errors.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
