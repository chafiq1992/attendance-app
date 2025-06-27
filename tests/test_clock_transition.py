import os, base64, json, types, sys
from unittest.mock import MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

# ensure backend path in sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

# ---- Fake modules ----
cred_json = base64.b64encode(json.dumps({"dummy": "val"}).encode()).decode()
os.environ['GOOGLE_CREDENTIALS_B64'] = cred_json
os.environ['SPREADSHEET_ID'] = 'dummy'

# fake gspread
fake_gspread = types.ModuleType('gspread')
fake_gspread.WorksheetNotFound = Exception
fake_ws = MagicMock()
fake_ws.get_values.return_value = []
fake_ws.insert_rows = MagicMock()
fake_ws.format = MagicMock()
fake_ws.append_row = MagicMock()
fake_ws.freeze = MagicMock()
fake_ws.insert_row = MagicMock()
fake_ws.update_cell = MagicMock()
fake_ws.col_count = 0
fake_ws.add_cols = MagicMock()
fake_ws.acell = MagicMock(return_value=MagicMock(value=""))

fake_ss = MagicMock()
fake_ss.worksheets.return_value = []
fake_ss.add_worksheet.return_value = fake_ws
fake_ss.worksheet.side_effect = fake_gspread.WorksheetNotFound
fake_gc = MagicMock()
fake_gc.open_by_key.return_value = fake_ss
fake_gspread.authorize = MagicMock(return_value=fake_gc)
sys.modules['gspread'] = fake_gspread

# fake google oauth Credentials
google_mod = types.ModuleType('google')
oauth2_mod = types.ModuleType('google.oauth2')
service_account_mod = types.ModuleType('google.oauth2.service_account')
class FakeCred:
    @classmethod
    def from_service_account_info(cls, info, scopes=None):
        return object()
service_account_mod.Credentials = FakeCred
oauth2_mod.service_account = service_account_mod
sys.modules['google'] = google_mod
sys.modules['google.oauth2'] = oauth2_mod
sys.modules['google.oauth2.service_account'] = service_account_mod

# import app after stubbing modules
import importlib
attendance = importlib.import_module('app.attendance')
attendance = importlib.reload(attendance)

app = FastAPI()
app.include_router(attendance.router)
client = TestClient(app)


def test_clock_transition_inserts_rows():
    resp = client.post('/attendance/clock', json={
        'employee': 'Alice',
        'action': 'clockin'
    })
    assert resp.status_code == 200
    fake_ws.insert_rows.assert_called_with([[], []], row=3)


def test_empty_month_rows_do_not_error():
    fake_ws.get_values.return_value = [[], []]
    resp = client.post('/attendance/clock', json={
        'employee': 'Bob',
        'action': 'clockin'
    })
    assert resp.status_code == 200


def test_clock_failing_returns_friendly_error():
    fake_ws.append_row.side_effect = Exception("gs fail")
    resp = client.post('/attendance/clock', json={
        'employee': 'Alice',
        'action': 'clockin'
    })
    assert resp.status_code == 500
    assert resp.json() == {'detail': 'Failed to record attendance'}
    fake_ws.append_row.side_effect = None
