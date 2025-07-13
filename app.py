import datetime as dt
import os
import logging
import time
import psycopg2
from psycopg2 import sql
from flask import Flask, request, send_from_directory, jsonify
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from asgi_to_wsgi import AsgiToWsgi

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------
# 1.  Flask setup
# --------------------------------------------------------------------
server = Flask(__name__, static_folder="static", static_url_path="/static")

# Mount FastAPI under /api using ASGI -> WSGI adapter
try:
    from api.main import app as fastapi_app
    server.wsgi_app = DispatcherMiddleware(
        server.wsgi_app, {"/api": AsgiToWsgi(fastapi_app)}
    )
except Exception:  # noqa: BLE001
    logger.exception("Failed mounting FastAPI app")

# --------------------------------------------------------------------
# Database helpers
# --------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("❌  DATABASE_URL or SUPABASE_URL env-var not set!")


def db_connect():
    """Return a new database connection."""
    return psycopg2.connect(DATABASE_URL)


def table_name(employee: str) -> str:
    """Sanitize employee name for use as a table name."""
    sanitized = "employee_" + "".join(
        c.lower() if c.isalnum() else "_" for c in employee
    )
    return sanitized


def ensure_employee_table(name: str) -> str:
    """Create the employee table if it doesn't already exist."""
    tbl = table_name(name)
    with db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {table} (
                        day DATE PRIMARY KEY,
                        clockin TIMESTAMPTZ,
                        clockout TIMESTAMPTZ,
                        break_start TIMESTAMPTZ,
                        break_end TIMESTAMPTZ,
                        extra_start TIMESTAMPTZ,
                        extra_end TIMESTAMPTZ,
                        cash TEXT,
                        orders TEXT,
                        payout TEXT,
                        advance TEXT
                    )
                    """
                ).format(table=sql.Identifier(tbl))
            )
    return tbl

# --------------------------------------------------------------------
# 3.  Helpers
# --------------------------------------------------------------------




def record_time(employee: str, action: str, day: int):
    """Insert or update today's timestamp for the given action."""
    now = dt.datetime.now(dt.timezone.utc)
    local = now.astimezone(dt.timezone(dt.timedelta(hours=0)))
    time_str = local.strftime("%H:%M")

    mapping = {
        "clockin": "clockin",
        "clockout": "clockout",
        "startbreak": "break_start",
        "endbreak": "break_end",
        "startextra": "extra_start",
        "endextra": "extra_end",
    }
    if action not in mapping:
        return False, f"Unknown action «{action}»"

    tbl = ensure_employee_table(employee)
    col = mapping[action]

    with db_connect() as conn:
        with conn.cursor() as cur:
            query = sql.SQL(
                "INSERT INTO {table} (day, {col}) VALUES (%s, %s) "
                "ON CONFLICT(day) DO UPDATE SET {col}=EXCLUDED.{col}"
            ).format(table=sql.Identifier(tbl), col=sql.Identifier(col))
            cur.execute(query, (now.date(), now))
        conn.commit()

    return True, f"{action.upper()} recorded @ {time_str}"


def record_value(employee: str, label: str, day: int, value: str):
    """Store an arbitrary value in the row mapped by `label`."""
    mapping = {
        "cash": "cash",
        "orders": "orders",
        "payout": "payout",
        "advance": "advance",
    }
    if label not in mapping:
        return False, f"Unknown label «{label}»"

    tbl = ensure_employee_table(employee)
    col = mapping[label]

    with db_connect() as conn:
        with conn.cursor() as cur:
            query = sql.SQL(
                "INSERT INTO {table} (day, {col}) VALUES (%s, %s) "
                "ON CONFLICT(day) DO UPDATE SET {col}=EXCLUDED.{col}"
            ).format(table=sql.Identifier(tbl), col=sql.Identifier(col))
            cur.execute(query, (dt.date.today(), str(value)))
        conn.commit()
    return True, "OK"

# --------------------------------------------------------------------
# 4.  Routes
# --------------------------------------------------------------------
@server.route("/")
def index():
    """Static index with query-string ?employee=Name if desired."""
    return send_from_directory("static", "index.html")

@server.route("/attendance", methods=["POST"])
def attendance():
    data = request.json or {}
    employee = data.get("employee", "").strip()
    action   = data.get("action", "").lower()
    if not employee or not action:
        return {"ok": False, "msg": "employee & action required"}, 400

    today = dt.datetime.now(dt.timezone.utc).astimezone().day
    ok, msg = record_time(employee, action, today)
    return jsonify(ok=ok, msg=msg)


@server.route("/payout", methods=["POST"])
def payout():
    data = request.json or {}
    employee = data.get("employee", "").strip()
    amount   = data.get("amount")
    if not employee or amount is None:
        return {"ok": False, "msg": "employee & amount required"}, 400

    today = dt.datetime.now(dt.timezone.utc).astimezone().day
    record_value(employee, "payout", today, amount)
    return jsonify(ok=True, msg="Payout recorded")


# Cloud Run health check
@server.route("/healthz")
def health():
    return "OK", 200
