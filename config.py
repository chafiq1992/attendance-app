import os

# ① ID of the Google Sheet that will hold the “Attendance” tab
GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID")  # required

# ② Name of the sheet/tab inside that spreadsheet
SHEET_NAME = "Attendance"

# ③ Time-zone for timestamps
TIMEZONE = "Africa/Casablanca"
