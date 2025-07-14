import datetime as dt
import os
import logging
import time
import psycopg2
from psycopg2 import sql
from flask import Flask, request, jsonify, abort
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from asgi_to_wsgi import AsgiToWsgi

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------
# 1.  Flask setup
# --------------------------------------------------------------------
# Serve compiled frontend assets from frontend/dist
dist_path = os.path.join(os.path.dirname(__file__), "frontend", "dist")
# Serve frontend assets under /static to avoid route conflicts
server = Flask(
    __name__, static_folder=dist_path, static_url_path="/static"
)

# Map the original Vite /assets URLs to our /static path
@server.route("/assets/<path:filename>")
def assets(filename: str):
    return server.send_static_file(os.path.join("assets", filename))

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
    url = DATABASE_URL
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return psycopg2.connect(url)


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


def record_value(employee: str, label: str, date: dt.date, value: str):
    """Store an arbitrary value in the row mapped by `label` for `date`."""
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
            cur.execute(query, (date, str(value)))
        conn.commit()
    logger.info("Recorded %s for %s on %s: %s", label, employee, date, value)
    return True, "OK"

# --------------------------------------------------------------------
# 4.  Routes
# --------------------------------------------------------------------
@server.route("/")
def index():
    """Serve the React build if available, otherwise show a placeholder."""
    index_file = os.path.join(dist_path, "index.html")
    if os.path.exists(index_file):
        return server.send_static_file("index.html")
    return jsonify(message="Attendance backend"), 200

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

    today = dt.datetime.now(dt.timezone.utc).date()
    record_value(employee, "payout", today, amount)
    return jsonify(ok=True, msg="Payout recorded")


@server.route("/advance", methods=["POST"])
def advance():
    data = request.json or {}
    employee = data.get("employee", "").strip()
    amount = data.get("amount")
    day_str = data.get("date")
    if not employee or amount is None:
        return {"ok": False, "msg": "employee & amount required"}, 400

    if day_str:
        try:
            day = dt.date.fromisoformat(day_str)
        except Exception:
            return {"ok": False, "msg": "invalid date"}, 400
    else:
        day = dt.datetime.now(dt.timezone.utc).date()

    record_value(employee, "advance", day, amount)
    return jsonify(ok=True, msg="Advance recorded")


@server.route("/record-order", methods=["POST"])
def record_order():
    data = request.json or {}
    employee = data.get("employee", "").strip()
    order_id = data.get("order_id", "").strip()
    total = data.get("total")
    day_str = data.get("date")
    if not employee or not order_id or total is None:
        return {"ok": False, "msg": "employee, order_id & total required"}, 400

    if day_str:
        try:
            day = dt.date.fromisoformat(day_str)
        except Exception:
            return {"ok": False, "msg": "invalid date"}, 400
    else:
        day = dt.datetime.now(dt.timezone.utc).date()

    record_value(employee, "orders", day, f"{order_id}:{total}")
    return jsonify(ok=True, msg="Order recorded")


@server.route("/employee-data")
def employee_data():
    """Return stored payout, advances and orders for a month."""
    employee = request.args.get("employee", "").strip()
    month = request.args.get("month", "")
    if not employee or not month:
        return {"ok": False, "msg": "employee & month required"}, 400
    try:
        year, m = map(int, month.split("-"))
    except Exception:
        return {"ok": False, "msg": "invalid month"}, 400

    start = dt.date(year, m, 1)
    end_month = 1 if m == 12 else m + 1
    end_year = year + 1 if m == 12 else year
    end = dt.date(end_year, end_month, 1)

    tbl = ensure_employee_table(employee)
    with db_connect() as conn:
        with conn.cursor() as cur:
            query = sql.SQL(
                "SELECT day, cash, orders, payout, advance FROM {table} "
                "WHERE day >= %s AND day < %s ORDER BY day"
            ).format(table=sql.Identifier(tbl))
            cur.execute(query, (start, end))
            rows = cur.fetchall()

    data = []
    for day, cash, orders, payout, advance in rows:
        orders_count = 0
        orders_total = 0.0
        if orders:
            for part in str(orders).split(','):
                if ':' in part:
                    try:
                        orders_total += float(part.split(':')[1])
                        orders_count += 1
                    except Exception:
                        pass
        try:
            payout_amt = float(payout) if payout is not None else 0.0
        except Exception:
            payout_amt = 0.0
        try:
            advance_amt = float(advance) if advance is not None else 0.0
        except Exception:
            advance_amt = 0.0
        data.append(
            {
                "date": day.isoformat(),
                "payout": payout_amt,
                "advance": advance_amt,
                "orders_count": orders_count,
                "orders_total": orders_total,
            }
        )
    return jsonify(data)


# Cloud Run health check
@server.route("/healthz")
def health():
    return "OK", 200


# Serve React app for any unmatched GET route
@server.route("/<path:path>", methods=["GET"])
def spa_catch_all(path: str):
    if path.startswith(("api", "attendance", "payout", "advance", "record-order", "healthz")):
        abort(404)
    return index()
