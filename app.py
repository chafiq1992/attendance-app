import datetime as dt
import os
import logging
from flask import Flask, request, send_from_directory, jsonify
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

# --------------------------------------------------------------------
# 2.  Google Sheets service
# --------------------------------------------------------------------
sheets_service = build("sheets", "v4", credentials=config.CREDENTIALS)
sheet          = sheets_service.spreadsheets()

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
            "(Cash Amount)", "(Order Count)", "(Payout)", "(Advance)",
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
                "(Cash Amount)",
                "(Order Count)",
                "(Payout)",
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


def record_time(employee: str, action: str, day: int):
    """Write today’s time into the proper cell."""
    now = dt.datetime.now(dt.timezone.utc).astimezone(
        dt.timezone(dt.timedelta(hours=0)))  # Africa/Casablanca == UTC+0 in July
    time_str = now.strftime('%H:%M')

    ensure_employee_sheet(employee)
    ensure_current_month_table(employee)
    base_row = 3
    col = day + 1   # Sheet column = day 1 → column B

    mapping = {
        "clockin": 0,
        "clockout": 1,
        "startbreak": 4,
        "endbreak": 5,
        "startextra": 7,
        "endextra": 8,
    }
    if action not in mapping:
        return False, f"Unknown action «{action}»"

    target_row = base_row + mapping[action]

    cell = f"{col_to_letter(col)}{target_row}"

    sheet.values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!{cell}",
        valueInputOption="USER_ENTERED",
        body={"values": [[time_str]]},
    ).execute()
    return True, f"{action.upper()} recorded @ {time_str}"


def record_value(employee: str, label: str, day: int, value: str):
    """Store an arbitrary value in the row mapped by `label`."""
    ensure_employee_sheet(employee)
    ensure_current_month_table(employee)

    base_row = 3
    col = day + 1
    mapping = {
        "cash": 9,
        "orders": 10,
        "payout": 11,
        "advance": 12,
    }
    if label not in mapping:
        return False, f"Unknown label «{label}»"

    target_row = base_row + mapping[label]
    cell = f"{col_to_letter(col)}{target_row}"

    sheet.values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!{cell}",
        valueInputOption="USER_ENTERED",
        body={"values": [[str(value)]]},
    ).execute()
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
    cash     = data.get("cash")
    orders   = data.get("orders")
    if not employee or not action:
        return {"ok": False, "msg": "employee & action required"}, 400

    today = dt.datetime.now(dt.timezone.utc).astimezone().day
    ok, msg = record_time(employee, action, today)
    if action == "clockout":
        if cash is not None and str(cash).strip():
            record_value(employee, "cash", today, cash)
        if orders is not None and str(orders).strip():
            record_value(employee, "orders", today, orders)
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
    amount   = data.get("amount")
    if not employee or amount is None:
        return {"ok": False, "msg": "employee & amount required"}, 400

    today = dt.datetime.now(dt.timezone.utc).astimezone().day
    record_value(employee, "advance", today, amount)
    return jsonify(ok=True, msg="Advance recorded")

@server.route("/sheet_data")
def sheet_data_route():
    """Return raw sheet values for the given employee."""
    employee = request.args.get("employee", "").strip()
    if not employee:
        return {"ok": False, "msg": "employee required"}, 400

    ensure_employee_sheet(employee)
    result = sheet.values().get(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!A1:AG",
    ).execute()
    values = result.get("values", [])
    return jsonify(values=values)

# Cloud Run health check
@server.route("/healthz")
def health():
    return "OK", 200
