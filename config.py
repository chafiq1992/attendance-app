# ── config.py ────────────────────────────────────────────────
import os, base64, json
from google.oauth2.service_account import Credentials
import gspread

# ① Non-secret settings
GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID")
SHEET_NAME      = "Attendance"
TIMEZONE        = "Africa/Casablanca"

# ② Secret: Base-64 JSON coming from env-var GCP_SA_B64
cred_b64 = os.getenv("GCP_SA_B64")
if not cred_b64:
    raise RuntimeError("❌  GCP_SA_B64 env-var not set!")

cred_json  = base64.b64decode(cred_b64).decode("utf-8")
creds_dict = json.loads(cred_json)

SCOPES      = ["https://www.googleapis.com/auth/spreadsheets"]
CREDENTIALS = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)

# ③ Handy gspread client for any module that needs Sheets
gc = gspread.authorize(CREDENTIALS)
