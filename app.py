import datetime as dt
import os
from flask import Flask, request, send_from_directory, jsonify
from google.oauth2 import service_account
from googleapiclient.discovery import build
import config
from config import CREDENTIALS        # for googleapiclient
from config import gc                 # gspread client                    #  ← already builds CREDENTIALS

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
def excel_time(now: dt.datetime) -> float:
    """Convert a datetime to Excel serial time (fraction of a day)."""
    return (now.hour / 24) + (now.minute / 1440)

def find_or_create_employee_row(name: str) -> int:
    """Return row number (1-based) for the first row of the 10-row block
       belonging to `name`.  Create the block if absent."""
    ssid = config.GOOGLE_SHEET_ID
    tab = config.SHEET_NAME

    # Read column A (names) starting from row 2
    col_a = sheet.values().get(
        spreadsheetId=ssid,
        range=f"{tab}!A2:A"
    ).execute().get("values", [])

    names = [r[0] for r in col_a]
    if name in names:
        return 2 + names.index(name)          # row where the name sits

    # Otherwise append10 new rows
    start_row = 2 + len(names)
    labels = [
        name, "(Out)", "(Duration)", "(Work Outcome)",
        "(Break Start)", "(Break End)", "(Break Outcome)",
        "(Extra Start)", "(Extra End)", "(Extra Outcome)",
    ]
    writes = [
        {"range": f"{tab}!A{start_row + i}", "values": [[label]]}
        for i, label in enumerate(labels)
    ]
    sheet.values().batchUpdate(
        spreadsheetId=ssid,
        body={"valueInputOption": "USER_ENTERED", "data": writes}
    ).execute()
    return start_row

def record_time(employee: str, action: str, day: int):
    """Write today’s time into the proper cell."""
    now = dt.datetime.now(dt.timezone.utc).astimezone(
        dt.timezone(dt.timedelta(hours=0)))  # Africa/Casablanca == UTC+0 in July
    serial = excel_time(now)

    base_row = find_or_create_employee_row(employee)
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
        range=f"{config.SHEET_NAME}!{target_row}:{target_row}",
        valueInputOption="USER_ENTERED",
        body={"values": [[""] * (col - 1) + [serial]]},
    ).execute()
    return True, f"{action.upper()} recorded @ {now.strftime('%H:%M')}"

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

# Cloud Run health check
@server.route("/healthz")
def health():
    return "OK", 200
