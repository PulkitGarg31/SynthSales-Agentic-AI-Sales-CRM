"""Alembic environment.

The DB URL and target metadata come from the app itself
(`app.core.config.settings` + `app.models`), so migrations always target the
same database the app uses and `--autogenerate` diffs against the live
SQLAlchemy models. Logging config from alembic.ini is applied only for CLI runs
(``config_file_name`` is set); the app's boot-time ``command.upgrade(...)``
passes no ini file, so it never reconfigures the app's own logging.
"""
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine, pool

# Make the `app` package importable whether alembic runs from the CLI (cwd=backend)
# or programmatically from the app at boot.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.database import Base  # noqa: E402
import app.models  # noqa: E402,F401  (import for the side effect: populates Base.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(
        settings.database_url, poolclass=pool.NullPool, future=True
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
