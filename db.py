import os
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, Date

# Database URL from env or default to local SQLite file
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///attendance.db")
engine = create_engine(DATABASE_URL)
metadata = MetaData()


def ensure_employee_table(name: str) -> Table:
    """Return SQLAlchemy Table for `name`, creating it if missing."""
    table_name = f"attendance_{name.lower()}"
    # Reflect to load existing tables
    metadata.reflect(bind=engine)

    if table_name not in metadata.tables:
        Table(
            table_name,
            metadata,
            Column("id", Integer, primary_key=True),
            Column("date", Date, nullable=False, unique=True),
            Column("clock_in", String(5)),
            Column("clock_out", String(5)),
            Column("break_start", String(5)),
            Column("break_end", String(5)),
            Column("extra_start", String(5)),
            Column("extra_end", String(5)),
            Column("extra_hours", String(5)),
            Column("cash", Integer, default=0),
            Column("advance", Integer, default=0),
            Column("orders", Integer, default=0),
        )
        metadata.create_all(bind=engine, tables=[metadata.tables[table_name]])
    return metadata.tables[table_name]
