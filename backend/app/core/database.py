from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# Pool sized to comfortably hold the concurrent-enrichment workers
# (orchestrator.ENRICH_MAX_WORKERS, each opening its own session) plus the
# orchestrator's own session and normal API request traffic. Keep pool_size at
# or above ENRICH_MAX_WORKERS + a small headroom so workers never serialize on
# pool_timeout. Default SQLAlchemy would be pool_size=5/max_overflow=10.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
    pool_size=10,
    max_overflow=10,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
