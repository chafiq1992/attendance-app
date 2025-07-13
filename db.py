import os
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


def get_engine() -> Engine:
    """Return a SQLAlchemy engine using DATABASE_URL env-var."""
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("\u274c  DATABASE_URL env-var not set!")

    engine = create_engine(
        url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
    )
    return engine

