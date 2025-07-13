import datetime as dt
import os
import logging
import time
import psycopg2
from psycopg2 import sql
from flask import Flask, request, send_from_directory, jsonify
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from asgiref.wsgi import AsgiToWsgi
from googleapiclient.discovery import build
import config
from config import CREDENTIALS        # for googleapiclient
from config import gc                 # gspread client

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
# 2.  Google Sheets service
# --------------------------------------------------------------------
sheets_service = build(
    "sheets",
    "v4",
    credentials=config.CREDENTIALS,
    cache_discovery=False,
)
sheet          = sheets_service.spreadsheets()

# Simple in-memory cache for sheet data
CACHE_TTL = 60  # seconds
SHEET_CACHE = {}

# --------------------------------------------------------------------
# Database helpers
# --------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("❌  DATABASE_URL env-var not set!")


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


def ensure_employee_sheet(name: str) -> str:
    """Return sheet/tab name for `name`, creating it from a template if needed."""
    ssid = config.GOOGLE_SHEET_ID
    sh = gc.open_by_key(ssid)

    try:
        sh.worksheet(name)
        return name
    except Exception:
        # Create new sheet and set up headers/labels
        ws = sh.add_worksheet(title=name, rows="50", cols="40")

        # Header row: Name, 1..31
        header = ["Name"] + [str(d) for d in range(1, 32)]
        ws.update("A1", [header])

        labels = [
            name, "(Out)", "(Duration)", "(Work Outcome)",
            "(Break Start)", "(Break End)", "(Break Outcome)",
            "(Extra Start)", "(Extra End)", "(Extra Outcome)",
            "(Avance)", "(Order Count)", "(Payment 15 jours)", "(Advance)",
        ]
        ws.update("A2:A15", [[lbl] for lbl in labels])

        return name


def ensure_current_month_table(name: str) -> None:
    """Ensure that the given sheet has a table for the current month at top."""
    ssid = config.GOOGLE_SHEET_ID
    sh = gc.open_by_key(ssid)
    ws = sh.worksheet(name)

    now = dt.datetime.now(dt.timezone.utc).astimezone(dt.timezone(dt.timedelta(hours=0)))
    current_label = now.strftime("%B %Y")

    first_cell = (ws.acell("A1").value or "").strip()
    if first_cell != current_label:
        inserted_rows = 0
        try:
            if first_cell.lower() == "name":
                prev_month = (now - dt.timedelta(days=1)).strftime("%B %Y")
                ws.insert_row([], index=1)
                inserted_rows += 1
                ws.update("A1", prev_month)

            header = ["Name"] + [str(d) for d in range(1, 32)]
            labels = [
                name,
                "(Out)",
                "(Duration)",
                "(Work Outcome)",
                "(Break Start)",
                "(Break End)",
                "(Break Outcome)",
                "(Extra Start)",
                "(Extra End)",
                "(Extra Outcome)",
                "(Avance)",
                "(Order Count)",
                "(Payment 15 jours)",
                "(Advance)",
            ]

            rows = [[current_label], header] + [[lbl] for lbl in labels]
            ws.insert_rows(rows, row=1)
            inserted_rows += len(rows)
        except Exception as exc:
            logger.error("Failed creating current month table for %s: %s", name, exc)
            if inserted_rows:
                try:
                    ws.delete_rows(1, inserted_rows)
                except Exception as cleanup_exc:
                    logger.error("Cleanup of failed table setup also failed: %s", cleanup_exc)
            raise

def col_to_letter(col: int) -> str:
    """Convert 1-indexed column number to Excel-style letters."""
    letters = ""
    while col:
        col, rem = divmod(col - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def _get_sheet_values(employee: str):
    """Return entire sheet values for the employee with caching."""
    ensure_employee_sheet(employee)
    ensure_current_month_table(employee)

    now = time.time()
    cached = SHEET_CACHE.get(employee)
    if cached and now - cached["time"] < CACHE_TTL:
        return cached["values"]

    try:
        result = sheet.values().get(
            spreadsheetId=config.GOOGLE_SHEET_ID,
            range=f"{employee}!A1:AG",
        ).execute()
        values = result.get("values", [])
    except Exception:
        logger.exception("Failed fetching sheet data for %s", employee)
        raise

    SHEET_CACHE[employee] = {"time": now, "values": values}
    return values


def month_label_from_param(month_str: str | None) -> str:
    """Convert a YYYY-MM string to "Month YYYY" label."""
    if not month_str:
        now = dt.datetime.now(dt.timezone.utc).astimezone(
            dt.timezone(dt.timedelta(hours=0))
        )
        return now.strftime("%B %Y")
    try:
        dt_obj = dt.datetime.strptime(month_str, "%Y-%m")
        return dt_obj.strftime("%B %Y")
    except Exception:
        return month_str


def get_month_values(employee: str, month_label: str):
    """Return rows for the given month label."""
    values = _get_sheet_values(employee)
    for i, row in enumerate(values):
        first = (row[0] or "").strip() if row else ""
        if first.lower() == month_label.lower():
            return values[i : i + 16]
    return []


def get_archive_months(employee: str):
    """Return list of previous months with their values."""
    values = _get_sheet_values(employee)
    months = []
    r = 0
    while r < len(values):
        row = values[r] if r < len(values) else []
        first = (row[0] or "").strip() if row else ""
        if first and first.lower() != "name":
            months.append({"month": first, "values": values[r : r + 16]})
            r += 16
        else:
            r += 1
    return months[1:] if months else []


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


@server.route("/advance", methods=["POST"])
def advance():
    data = request.json or {}
    employee = data.get("employee", "").strip()
    amount = data.get("amount")
    if not employee or amount is None:
        return {"ok": False, "msg": "employee & amount required"}, 400

    today = dt.datetime.now(dt.timezone.utc).astimezone().day

    ensure_employee_sheet(employee)
    ensure_current_month_table(employee)
    base_row = 3
    col = today + 1
    row = base_row + 13  # advance row offset
    cell = f"{col_to_letter(col)}{row}"

    result = sheet.values().get(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!{cell}"
    ).execute()
    existing = result.get("values", [[""]])[0][0] if result.get("values") else ""
    new_val = f"{existing}\n{amount}" if existing else str(amount)

    sheet.values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!{cell}",
        valueInputOption="USER_ENTERED",
        body={"values": [[new_val]]},
    ).execute()

    return jsonify(ok=True, msg="Advance recorded")


@server.route("/cash", methods=["POST"])
def cash():
    data = request.json or {}
    employee = data.get("employee", "").strip()
    amount = data.get("amount")
    if not employee or amount is None:
        return {"ok": False, "msg": "employee & amount required"}, 400

    today = dt.datetime.now(dt.timezone.utc).astimezone().day

    ensure_employee_sheet(employee)
    ensure_current_month_table(employee)
    base_row = 3
    col = today + 1
    row = base_row + 10  # cash row offset
    cell = f"{col_to_letter(col)}{row}"

    result = sheet.values().get(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!{cell}"
    ).execute()
    existing = result.get("values", [[""]])[0][0] if result.get("values") else ""
    new_val = f"{existing}\n{amount}" if existing else str(amount)

    sheet.values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!{cell}",
        valueInputOption="USER_ENTERED",
        body={"values": [[new_val]]},
    ).execute()

    return jsonify(ok=True, msg="Cash recorded")


@server.route("/order", methods=["POST"])
def order():
    data = request.json or {}
    employee = data.get("employee", "").strip()
    number = str(data.get("number", "")).strip()
    if not employee or not number:
        return {"ok": False, "msg": "employee & number required"}, 400

    today = dt.datetime.now(dt.timezone.utc).astimezone().day

    ensure_employee_sheet(employee)
    ensure_current_month_table(employee)
    base_row = 3
    col = today + 1
    row = base_row + 11  # orders row offset
    cell = f"{col_to_letter(col)}{row}"

    result = sheet.values().get(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!{cell}"
    ).execute()
    existing = result.get("values", [[""]])[0][0] if result.get("values") else ""
    new_val = f"{existing}\n{number}" if existing else number

    sheet.values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!{cell}",
        valueInputOption="USER_ENTERED",
        body={"values": [[new_val]]},
    ).execute()

    return jsonify(ok=True, msg="Order recorded")


@server.route("/month_schedule")
def month_schedule():
    """Return rows for a specific employee and month."""
    employee = request.args.get("employee", "").strip()
    month_param = request.args.get("month", "").strip()
    if not employee:
        return {"ok": False, "msg": "employee required"}, 400

    label = month_label_from_param(month_param)
    values = get_month_values(employee, label)
    return jsonify(values=values)


@server.route("/archive")
def archive():
    """Return previous months for an employee."""
    employee = request.args.get("employee", "").strip()
    if not employee:
        return {"ok": False, "msg": "employee required"}, 400

    months = get_archive_months(employee)
    return jsonify(months=months)

@server.route("/sheet_data")
def sheet_data_route():
    """Return raw sheet values for the given employee."""
    employee = request.args.get("employee", "").strip()
    if not employee:
        return {"ok": False, "msg": "employee required"}, 400

    month_label = month_label_from_param(None)
    values = get_month_values(employee, month_label)
    return jsonify(values=values)


# --------------------------------------------------------------------
# 5.  Admin endpoints
# --------------------------------------------------------------------

@server.route("/admin")
def admin_index():
    """Serve the admin dashboard."""
    return send_from_directory("static", "admin.html")


@server.route("/admin/employees")
def admin_employees():
    """List all employee sheet names."""
    ssid = config.GOOGLE_SHEET_ID
    sh = gc.open_by_key(ssid)
    names = [ws.title for ws in sh.worksheets()]
    return jsonify(employees=names)


@server.route("/admin/attendance/<employee>")
def admin_attendance(employee: str):
    """Return raw sheet values for the given employee."""
    ensure_employee_sheet(employee)
    try:
        result = sheet.values().get(
            spreadsheetId=config.GOOGLE_SHEET_ID,
            range=f"{employee}!A1:AG",
        ).execute()
    except Exception:
        logger.exception("Failed fetching sheet data for %s", employee)
        return jsonify(error="Failed retrieving sheet data"), 500

    values = result.get("values", [])
    return jsonify(values=values)

# Cloud Run health check
@server.route("/healthz")
def health():
    return "OK", 200
