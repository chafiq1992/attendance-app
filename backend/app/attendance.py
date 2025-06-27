# ────────────────────────────────────────────────────────────────
#  Attendance API – One sheet tab per employee, live month summary
# ----------------------------------------------------------------
import json, os, base64 
import os, json, datetime as dt
from typing import List, Optional, Dict
import gspread, pytz
from google.oauth2.service_account import Credentials 
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

# --- Google secret handling ------------------------------------
cred_b64 = os.getenv("GOOGLE_CREDENTIALS_B64", "")
if not cred_b64:
    raise RuntimeError("Missing GOOGLE_CREDENTIALS_B64 env-var")

creds_dict  = json.loads(base64.b64decode(cred_b64).decode("utf-8"))
SCOPES      = ["https://www.googleapis.com/auth/spreadsheets"]
credentials = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
gc          = gspread.authorize(credentials)

spreadsheet_id = os.getenv("SPREADSHEET_ID", "")
if not spreadsheet_id:
    raise RuntimeError("Missing SPREADSHEET_ID env-var")

ss = gc.open_by_key(spreadsheet_id)

# ---------- Wage map ----------
# Example env var:
#   EMPLOYEE_WAGES_JSON='{"Alice":80,"Bob":75,"Nora":90}'
WAGE_MAP: Dict[str, float] = json.loads(os.getenv("EMPLOYEE_WAGES_JSON", "{}"))

# ---------- Models ----------
class ClockBody(BaseModel):
    employee: str
    action:   str        # clockin / clockout / startbreak / endbreak / startextra / endextra
    dayflag:  str = "full"  # "full" | "half" etc.

class Summary(BaseModel):
    employee: str
    month: str
    days: int
    hours: float
    earned: float

router = APIRouter(prefix="/attendance", tags=["attendance"])

HEADER = [
    "Timestamp","Action","DayFlag","Month",
    "Main-In","Main-Out",
    "Break-In","Break-Out",
    "Extra-In","Extra-Out"
]

# ---------- Helpers ----------
def _ws(emp:str):
    if emp in [s.title for s in ss.worksheets()]:
        return ss.worksheet(emp)
    ws = ss.add_worksheet(title=emp, rows="1000", cols=str(len(HEADER)))
    ws.append_row(HEADER)
    ws.format("1:1", {"textFormat":{"bold":True}, "backgroundColor":{"red":.9,"green":.9,"blue":.9}})
    ws.freeze(rows=2)
    ws.insert_row([""]*len(HEADER), 2)   # summary row
    return ws

def _month_sep(ws, month):
    months = [m[0] for m in ws.get_values("D3:D")]
    last   = next((m for m in reversed(months) if m), "")
    if last != month:
        ws.insert_rows(row=3, number=2)

def _update_summary(ws, emp, month)->Summary:
    vals = ws.get_values("A3:J")
    mins, days, clock_in, extra_in = 0, set(), None, None
    for r in vals:
        if not r or r[3] != month: continue
        ts  = dt.datetime.fromisoformat(r[0]) if r[0] else None
        act = r[1]
        if act=="clockin":  clock_in = ts; days.add(r[2])
        if act=="clockout" and clock_in:
            mins += (ts-clock_in).total_seconds()/60; clock_in=None
        if act=="startextra": extra_in = ts
        if act=="endextra" and extra_in:
            mins += (ts-extra_in).total_seconds()/60; extra_in=None
    hours  = round(mins/60,2)
    earned = WAGE_MAP.get(emp,0)*len(days)
    ws.batch_update([{
        "range":"A2:F2",
        "values":[[f"📅 {month}","","Days: {len(days)}","","🕒 {hours} h",f"💵 {earned} DH"]]
    },{
        "range":"A2:F2",
        "cell":{"userEnteredFormat":{"textFormat":{"bold":True},
               "backgroundColor":{"red":.85,"green":.9,"blue":1},
               "borders":{"bottom":{"style":"SOLID_THICK","color":
                         {"red":.29,"green":.53,"blue":.91}}}}}
    }], fields="userEnteredFormat")
    return Summary(employee=emp,month=month,days=len(days),hours=hours,earned=earned)

# ---------- Routes ----------
@router.post("/clock", response_model=Summary)
def clock(body: ClockBody):
    tz   = pytz.timezone(os.getenv("TZ","Africa/Casablanca"))
    now  = dt.datetime.now(tz)
    mon  = now.strftime("%Y-%m")
    ws   = _ws(body.employee)
    _month_sep(ws, mon)

    def iso(t): return t.isoformat() if t else ""

    ws.append_row([
        now.isoformat(), body.action, body.dayflag, mon,
        iso(now) if body.action=="clockin"   else "",
        iso(now) if body.action=="clockout"  else "",
        iso(now) if body.action=="startbreak" else "",
        iso(now) if body.action=="endbreak"   else "",
        iso(now) if body.action=="startextra" else "",
        iso(now) if body.action=="endextra"   else ""
    ])
    return _update_summary(ws, body.employee, mon)

@router.get("/summary", response_model=Summary)
def summary(employee:str=Query(...), month:str=Query(None)):
    if not month:
        month = dt.datetime.now().strftime("%Y-%m")
    ws = _ws(employee)
    return _update_summary(ws, employee, month)
