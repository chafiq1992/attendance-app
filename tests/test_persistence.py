import os
import importlib
import pytest
from testcontainers.postgres import PostgresContainer

@pytest.mark.asyncio
async def test_advance_and_orders_accumulate():
    with PostgresContainer("postgres:15") as pg:
        url = pg.get_connection_url()
        os.environ["DATABASE_URL"] = url
        import app
        importlib.reload(app)
        from app import server

        with server.test_client() as c:
            resp = c.post("/advance", json={"employee": "alice", "amount": 10, "date": "2024-01-02"})
            assert resp.status_code == 200
            resp = c.post("/advance", json={"employee": "alice", "amount": 5, "date": "2024-01-02"})
            assert resp.status_code == 200
            resp = c.post("/record-order", json={"employee": "alice", "order_id": "A1", "total": 20, "date": "2024-01-02"})
            assert resp.status_code == 200
            resp = c.post("/record-order", json={"employee": "alice", "order_id": "B2", "total": 30, "date": "2024-01-02"})
            assert resp.status_code == 200
            resp = c.get("/employee-data", query_string={"employee": "alice", "month": "2024-01"})
            assert resp.status_code == 200
            data = resp.get_json()
            rec = next(d for d in data if d["date"] == "2024-01-02")
            assert rec["advance"] == 15.0
            assert rec["orders_count"] == 2
            assert rec["orders_total"] == 50.0
