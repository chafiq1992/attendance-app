# ────────────────────────────────────────────────────────────────
#  Attendance API – One sheet tab per employee, live month summary
# ----------------------------------------------------------------
import os
import json
import base64
import datetime as dt
from typing import List, Optional, Dict
import logging

import gspread
import pytz
from google.oauth2.service_account import Credentials
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from .attendance_legacy import (
    to_excel_time, break_outcome, extra_outcome,
    main_duration_and_outcome
)

# --- Google secret handling ------------------------------------
cred_b64 = os.getenv("GOOGLE_CREDENTIALS_B64", "")
if not cred_b64:
    raise RuntimeError("Missing GOOGLE_CREDENTIALS_B64 env-var")

creds_dict = json.loads(base64.b64decode(cred_b64).decode("utf-8"))
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
credentials = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
gc = gspread.authorize(credentials)

spreadsheet_id = os.getenv("SPREADSHEET_ID", "")
if not spreadsheet_id:
    raise RuntimeError("Missing SPREADSHEET_ID env-var")

ss = gc.open_by_key(spreadsheet_id)


# ---------- Model for simple attendance endpoint ----------
class AttendanceEvent(BaseModel):
    employee: str
    action: str  # "clockin", "clockout", "startbreak", …
    ts: dt.datetime


# ---------- Wage map ----------
# Example env var:
#   EMPLOYEE_WAGES_JSON='{"Alice":80,"Bob":75,"Nora":90}'
WAGE_MAP: Dict[str, float] = json.loads(os.getenv("EMPLOYEE_WAGES_JSON", "{}"))


# ---------- Models ----------
class ClockBody(BaseModel):
    employee: str
    action: str  # clockin / clockout / startbreak / endbreak / startextra / endextra
    dayflag: str = "full"  # "full" | "half" etc.


class Summary(BaseModel):
    employee: str
    month: str
    days: int
    hours: float
    earned: float


router = APIRouter(prefix="/attendance", tags=["attendance"])

HEADER = [
    "Timestamp",
    "Action",
    "DayFlag",
    "Month",
    "Main-In",
    "Main-Out",
    "Break-In",
    "Break-Out",
    "Extra-In",
    "Extra-Out",
]

# ----- Legacy table style sheet -----
ATTENDANCE_SHEET_NAME = "Attendance"


# ---------- Helpers ----------
def _ws(emp: str):
    if emp in [s.title for s in ss.worksheets()]:
        return ss.worksheet(emp)
    ws = ss.add_worksheet(title=emp, rows="1000", cols=str(len(HEADER)))
    ws.append_row(HEADER)
    ws.format(
        "1:1",
        {
            "textFormat": {"bold": True},
            "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9},
            "borders": {
                "bottom": {
                    "style": "SOLID_THICK",
                    "color": {"red": 0, "green": 0, "blue": 0},
                }
            },
        },
    )
    ws.freeze(rows=2)
    ws.insert_row([""] * len(HEADER), 2)  # summary row
    ws.format(
        "2:2",
        {
            "textFormat": {"bold": True},
            "borders": {
                "bottom": {
                    "style": "SOLID_THICK",
                    "color": {"red": 0.29, "green": 0.53, "blue": 0.91},
                }
            },
        },
    )
    return ws


def _month_sep(ws, month):
    # gspread may return [] for blank rows so guard indexing
    months = [m[0] for m in ws.get_values("D3:D") if m]
    last = next((m for m in reversed(months) if m), "")
    if last != month:
        ws.insert_rows([[], []], row=3)
        ws.format(
            "3:3",
            {
                "borders": {
                    "top": {
                        "style": "SOLID_THICK",
                        "color": {"red": 0, "green": 0, "blue": 0},
                    }
                }
            },
        )


# ----- Legacy attendance table helpers ---------------------------
def _attendance_sheet():
    """Return the legacy sheet used for simple clock in/out table."""
    try:
        ws = ss.worksheet(ATTENDANCE_SHEET_NAME)
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(ATTENDANCE_SHEET_NAME, rows="1000", cols="33")
        # NEW – 31 days + Σ
        ws.append_row(["Name"] + [str(i) for i in range(1, 32)] + ["Σ"])
    # ensure enough columns for all days
    if ws.col_count < 33:  # 32 (day cols) + 1 Σ
        ws.add_cols(33 - ws.col_count)
    return ws


# ────────────────────────────────────────────────────────────────
#  NEW – make sure the current-month grid is always at the top
#      (inside each employee sheet)
# ────────────────────────────────────────────────────────────────
def _ensure_month_grid(ws, emp: str, month: str) -> None:
    """Insert a brand-new grid at the top the first time we touch a month."""
    if ws.acell("A1").value == month:
        return

    # 1) push everything down (logs, previous months…)
    ws.insert_rows([[] for _ in range(11)], 1)

    # 2) write header row 1  (month, 1 … 31, Σ)
    header = [month] + [str(d) for d in range(1, 32)] + ["Σ"]
    ws.update("A1:AG1", [header])
    ws.format(
        "1:1",
        {
            "textFormat": {"bold": True},
            "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9},
            "borders": {
                "bottom": {
                    "style": "SOLID_THICK",
                    "color": {"red": 0, "green": 0, "blue": 0},
                }
            },
        },
    )

    # 3) labels in col A, rows 2-11
    # First column labels – updated to match the UI table
    labels = [
        "Clock-In",
        "Clock-Out",
        "Main (h m)",
        "Break-Start",
        "Break-End",
        "Break (min)",
        "Extra-Start",
        "Extra-End",
        "Extra (min)",
        "Outcome",
    ]
    ws.update("A2:A11", [[l] for l in labels])

    # 4) Σ-formulas in the new grid
    for r in (4, 7, 10):
        ws.update_cell(r, 33, f"=SUM(B{r}:AF{r})")

    # 5) keep header + labels frozen
    ws.freeze(rows=2)


def _record_into_grid(ws, action: str, ts: dt.datetime, start_row: int):
    """
    Write the punch + immediately recompute the 3 outcome rows.

    start_row → the first row of the 10-row block for this employee.
    """
    col = ts.day + 1                           # 1-based; B=2 … AF=32
    time_serial = to_excel_time(ts.strftime("%H:%M"))

    rows = {
        "clockin":     start_row,         # Main-In
        "clockout":    start_row + 1,     # Main-Out
        "startbreak":  start_row + 4,     # Break-In
        "endbreak":    start_row + 5,     # Break-Out
        "startextra":  start_row + 7,     # Extra-In
        "endextra":    start_row + 8      # Extra-Out
    }
    if action in rows:
        ws.update_cell(rows[action], col, time_serial)
        ws.format(gspread.utils.rowcol_to_a1(rows[action], col),
                  {"numberFormat": {"type": "TIME", "pattern": "hh:mm"}})

    # ── Re-calculate durations/outcomes exactly like GAS ──────────
    vals = lambda r: ws.cell(r, col, value_render_option="UNFORMATTED_VALUE").value

    # Main
    dur_txt, outcome_txt = main_duration_and_outcome(
        vals(start_row), vals(start_row + 1),
        vals(start_row + 4), vals(start_row + 5)
    )
    ws.update_cell(start_row + 2, col, dur_txt)
    ws.update_cell(start_row + 3, col, outcome_txt)

    # Break
    ws.update_cell(start_row + 6, col,
                   break_outcome(vals(start_row + 4), vals(start_row + 5)))

    # Extra
    ws.update_cell(start_row + 9, col,
                   extra_outcome(vals(start_row + 7), vals(start_row + 8)))


def _find_or_create_employee_row(name: str, ws) -> int:
    """Return the start row of the employee block, inserting if needed."""
    names = ws.col_values(1)[1:]
    if name in names:
        return names.index(name) + 2

    start_row = len(names) + 2
    # insert 10 empty rows using distinct lists so gspread treats them
    # as separate rows
    ws.insert_rows([[] for _ in range(10)], start_row)
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
    ]
    for i, label in enumerate(labels):
        ws.update_cell(start_row + i, 1, label)
    # ─── Σ formulas – written once ───────────────────────────
    sum_col = 33  # column AG (after AF = 32)
    # Work Outcome  → row start+3  • Break Outcome → start+6  • Extra Outcome → start+9
    ws.update_cell(start_row + 3, sum_col, f"=SUM(B{start_row+3}:AF{start_row+3})")
    ws.update_cell(start_row + 6, sum_col, f"=SUM(B{start_row+6}:AF{start_row+6})")
    ws.update_cell(start_row + 9, sum_col, f"=SUM(B{start_row+9}:AF{start_row+9})")
    return start_row


def _to_excel_time(ts: dt.datetime) -> float:
    return ts.hour / 24 + ts.minute / 1440 + ts.second / 86400


def _to_minutes(val) -> Optional[int]:
    if val in ("", None):
        return None
    if isinstance(val, (int, float)):
        return int(val) if val > 1 else int(val * 24 * 60)
    if isinstance(val, dt.datetime):
        return val.hour * 60 + val.minute
    if isinstance(val, str):
        if ":" in val:
            try:
                h, m = [int(x) for x in val.split(":")]
                return h * 60 + m
            except ValueError:
                return None
        try:
            f = float(val)
            return int(f) if f > 1 else int(f * 24 * 60)
        except ValueError:
            return None
    return None


def _duration_between(start, end, fmt="min") -> str:
    s = _to_minutes(start)
    e = _to_minutes(end)
    if s is None or e is None or e <= s:
        return ""
    d = e - s
    if fmt == "min":
        return f"{d} min"
    return f"{d//60}h {d%60}m"


def _main_duration(clock_in, clock_out, break_start, break_end, fmt="h m") -> str:
    """Return total minutes between clock in and out minus breaks."""
    s = _to_minutes(clock_in)
    e = _to_minutes(clock_out)
    if s is None or e is None or e <= s:
        return ""
    bs = _to_minutes(break_start)
    be = _to_minutes(break_end)
    break_min = 0
    if bs is not None and be is not None and be > bs:
        break_min = be - bs
    d = e - s - break_min
    if d <= 0:
        return ""
    if fmt == "min":
        return f"{d} min"
    return f"{d//60}h {d%60}m"


def record_attendance_table(emp: str, action: str, ts: dt.datetime) -> None:
    ws = _attendance_sheet()

    # NEW ➜ drop a fresh grid at the top whenever the month changes
    current_mon = ts.strftime("%Y-%m")  # e.g. "2025-06"
    _ensure_month_grid(ws, emp, current_mon)

    column = ts.day + 1  # 1 → col B, 31 → col AF
    start = _find_or_create_employee_row(emp, ws)
    rows = {
        "clockin": start,
        "clockout": start + 1,
        "startbreak": start + 4,
        "endbreak": start + 5,
        "startextra": start + 7,
        "endextra": start + 8,
    }
    if action in rows:
        ws.update_cell(rows[action], column, _to_excel_time(ts))
    # update main/break/extra outcomes
    main_dur = _main_duration(
        ws.cell(start, column).value,
        ws.cell(start + 1, column).value,
        ws.cell(start + 4, column).value,
        ws.cell(start + 5, column).value,
        "h m",
    )
    ws.update_cell(start + 2, column, main_dur)
    ws.update_cell(start + 3, column, main_dur)
    ws.update_cell(
        start + 9,
        column,
        _duration_between(
            ws.cell(start + 7, column).value,
            ws.cell(start + 8, column).value,
            "h m",
        ),
    )
    ws.update_cell(
        start + 6,
        column,
        _duration_between(
            ws.cell(start + 4, column).value,
            ws.cell(start + 5, column).value,
            "min",
        ),
    )


def _update_summary(ws, emp, month) -> Summary:
    vals = ws.get_values("A3:J")
    mins, days, clock_in, extra_in = 0, set(), None, None
    for r in vals:
        if not r or r[3] != month:
            continue
        ts = dt.datetime.fromisoformat(r[0]) if r[0] else None
        act = r[1]
        if act == "clockin":
            clock_in = ts
            days.add(r[2])
        if act == "clockout" and clock_in:
            mins += (ts - clock_in).total_seconds() / 60
            clock_in = None
        if act == "startextra":
            extra_in = ts
        if act == "endextra" and extra_in:
            mins += (ts - extra_in).total_seconds() / 60
            extra_in = None
    hours = round(mins / 60, 2)
    earned = WAGE_MAP.get(emp, 0) * len(days)
    ws.batch_update(
        [
            {
                "range": "A2:F2",
                "values": [
                    [
                        f"📅 {month}",
                        "",
                        "Days: {len(days)}",
                        "",
                        "🕒 {hours} h",
                        f"💵 {earned} DH",
                    ]
                ],
            },
            {
                "range": "A2:F2",
                "cell": {
                    "userEnteredFormat": {
                        "textFormat": {"bold": True},
                        "backgroundColor": {"red": 0.85, "green": 0.9, "blue": 1},
                        "borders": {
                            "bottom": {
                                "style": "SOLID_THICK",
                                "color": {"red": 0.29, "green": 0.53, "blue": 0.91},
                            }
                        },
                    }
                },
            },
        ],
        fields="userEnteredFormat",
    )
    return Summary(
        employee=emp, month=month, days=len(days), hours=hours, earned=earned
    )


def _month_grid(ws, emp: str, month: str):
    """Return the 10-row month grid from the employee worksheet."""
    _ensure_month_grid(ws, emp, month)
    data = ws.get_values("A1:AG11")
    header = data[0]
    rows = data[1:]
    return {"header": header, "rows": rows}


# ---------- Routes ----------
@router.post("/clock", response_model=Summary)
def clock(body: ClockBody):
    try:
        tz = pytz.timezone(os.getenv("TZ", "Africa/Casablanca"))
        now = dt.datetime.now(tz)
        mon = now.strftime("%Y-%m")
        ws = _ws(body.employee)
        _month_sep(ws, mon)

        def iso(t):
            return t.isoformat() if t else ""

        # NEW – keep the per-employee month grid in sync
        _ensure_month_grid(ws, body.employee, mon)
        start_row = _find_or_create_employee_row(body.employee, ws)
        _record_into_grid(ws, body.action, now, start_row)
        return _update_summary(ws, body.employee, mon)
    except Exception:
        logging.exception("Failed to record attendance")
        raise HTTPException(status_code=500, detail="Failed to record attendance")




# ────────────────────────────────────────────────────────────────
#  /attendance/summary  – now reads the TOP grid (no raw log needed)
# ────────────────────────────────────────────────────────────────
@router.get("/summary")
def summary(employee: str = Query(...), month: str | None = None):
    """
    Quick totals for an employee & month

    Returns → {month, days, hours}
    """
    if month is None:
        month = dt.datetime.now().strftime("%Y-%m")

    # open that employee’s sheet
    try:
        ws = gc.open_by_key(spreadsheet_id).worksheet(employee)
    except gspread.WorksheetNotFound:
        raise HTTPException(status_code=404, detail="Employee sheet not found")

    # make sure the month grid exists (will create it on first punch-in)
    _ensure_month_grid(ws, employee, month)

    # rows: 2 = Main-In   · 3 = Main-Out
    in_row, out_row = 2, 3
    worked_days, total_hours = 0, 0.0

    # columns B (=2) … AF (=32)  → range 2-32 inclusive
    for col in range(2, 33):
        incell = ws.cell(in_row, col, value_render_option="UNFORMATTED_VALUE").value
        outcell = ws.cell(out_row, col, value_render_option="UNFORMATTED_VALUE").value

        if isinstance(incell, (int, float)) and isinstance(outcell, (int, float)) and outcell > incell:
            worked_days += 1
            total_hours += (outcell - incell) * 24

    return {"month": month, "days": worked_days, "hours": round(total_hours, 2)}


@router.get("/month-grid")
def month_grid(employee: str = Query(...), month: str = Query(None)):
    """Return the month grid stored in the employee tab."""
    if month is None:
        month = dt.datetime.now().strftime("%Y-%m")
    ws = _ws(employee)
    return _month_grid(ws, employee, month)


# ---------- Simplified attendance endpoint ----------
@router.post("")
def record_attendance(ev: AttendanceEvent):
    tab_name = ev.employee.capitalize()
    try:
        try:
            ws = ss.worksheet(tab_name)
        except gspread.WorksheetNotFound:
            ws = ss.add_worksheet(tab_name, rows=1000, cols=10)

        tz = pytz.timezone("Europe/Lisbon")  # adjust!
        local_dt = ev.ts.astimezone(tz)

        ws.append_row([local_dt.strftime("%Y-%m-%d %H:%M:%S"), ev.action])

        # legacy attendance table is no longer used

        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
