import os
import pathlib
import pytest

os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/db")

from app import server  # noqa: E402

@pytest.fixture()
def client():
    server.testing = True
    with server.test_client() as c:
        yield c

INDEX_FILE = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "dist" / "index.html"
EXPECTED_CONTENT = INDEX_FILE.read_bytes()


def test_admin_dashboard(client):
    resp = client.get("/admin-dashboard")
    assert resp.status_code == 200
    assert resp.mimetype == "text/html"
    assert resp.data == EXPECTED_CONTENT


def test_employee_dashboard(client):
    resp = client.get("/employee-dashboard")
    assert resp.status_code == 200
    assert resp.mimetype == "text/html"
    assert resp.data == EXPECTED_CONTENT


def test_monthly_sheets(client):
    resp = client.get("/monthly-sheets")
    assert resp.status_code == 200
    assert resp.mimetype == "text/html"
    assert resp.data == EXPECTED_CONTENT


def test_period_summary(client):
    resp = client.get("/period-summary")
    assert resp.status_code == 200
    assert resp.mimetype == "text/html"
    assert resp.data == EXPECTED_CONTENT
