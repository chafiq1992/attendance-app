import datetime as dt
import os
from flask import Flask, request, send_from_directory, jsonify
from google.oauth2 import service_account
from googleapiclient.discovery import build
import config
from config import CREDENTIALS        # for googleapiclient
from config import gc                 # gspread client

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
        ]
        ws.update("A2:A11", [[lbl] for lbl in labels])

        return name

def record_time(employee: str, action: str, day: int):
    """Write today’s time into the proper cell."""
    now = dt.datetime.now(dt.timezone.utc).astimezone(
        dt.timezone(dt.timedelta(hours=0)))  # Africa/Casablanca == UTC+0 in July
    time_str = now.strftime('%H:%M')

    ensure_employee_sheet(employee)
    base_row = 2
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

    sheet.values().update(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!{target_row}:{target_row}",
        valueInputOption="USER_ENTERED",
        body={"values": [[""] * (col - 1) + [time_str]]},
    ).execute()
    return True, f"{action.upper()} recorded @ {time_str}"

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

@server.route("/sheet_data")
def sheet_data_route():
    """Return raw sheet values for the given employee."""
    employee = request.args.get("employee", "").strip()
    if not employee:
        return {"ok": False, "msg": "employee required"}, 400

    ensure_employee_sheet(employee)
    result = sheet.values().get(
        spreadsheetId=config.GOOGLE_SHEET_ID,
        range=f"{employee}!A1:AG11",
    ).execute()
    values = result.get("values", [])
    return jsonify(values=values)

# Cloud Run health check
@server.route("/healthz")
def health():
    return "OK", 200
