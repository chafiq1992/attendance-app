from datetime import datetime, timezone

import pytest


@pytest.mark.asyncio
async def test_event_lifecycle(client):
    ts = datetime.now(timezone.utc).isoformat()

    # create
    resp = await client.post(
        "/events", params={"employee_id": "alice", "kind": "in", "timestamp": ts}
    )
    assert resp.status_code == 200
    event_id = resp.json()["id"]

    # list
    resp = await client.get("/events")
    assert resp.status_code == 200
    events = resp.json()
    assert any(e["id"] == event_id for e in events)

    # update
    resp = await client.patch(f"/events/{event_id}", json={"kind": "out"})
    assert resp.status_code == 200
    assert resp.json()["id"] == event_id

    resp = await client.get("/events")
    updated = [e for e in resp.json() if e["id"] == event_id][0]
    assert updated["kind"] == "out"

    # delete
    resp = await client.delete(f"/events/{event_id}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    # confirm deletion
    resp = await client.get("/events")
    assert all(e["id"] != event_id for e in resp.json())


@pytest.mark.asyncio
async def test_not_found(client):
    resp = await client.patch("/events/9999", json={"kind": "out"})
    assert resp.status_code == 404
    resp = await client.delete("/events/9999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_summary(client):
    ts_in = datetime(2024, 1, 1, 9, tzinfo=timezone.utc)
    ts_break_start = datetime(2024, 1, 1, 13, tzinfo=timezone.utc)
    ts_break_end = datetime(2024, 1, 1, 14, tzinfo=timezone.utc)
    ts_out = datetime(2024, 1, 1, 18, tzinfo=timezone.utc)
    await client.post(
        "/events",
        params={"employee_id": "bob", "kind": "clockin", "timestamp": ts_in.isoformat()},
    )
    await client.post(
        "/events",
        params={"employee_id": "bob", "kind": "startbreak", "timestamp": ts_break_start.isoformat()},
    )
    await client.post(
        "/events",
        params={"employee_id": "bob", "kind": "endbreak", "timestamp": ts_break_end.isoformat()},
    )
    await client.post(
        "/events",
        params={"employee_id": "bob", "kind": "clockout", "timestamp": ts_out.isoformat()},
    )

    resp = await client.get("/summary", params={"employee_id": "bob", "month": "2024-01"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_hours"] == 8.0
    assert data["hours_per_day"]["1"] == 8.0
    assert data["total_extra"] == 0.0
    assert data["total_penalty"] == 0.0
    assert data["net_time"] == 0.0


@pytest.mark.asyncio
async def test_summary_extra_and_penalty(client):
    # Day 1 - overtime
    d1_in = datetime(2024, 1, 1, 9, tzinfo=timezone.utc)
    d1_break_s = datetime(2024, 1, 1, 13, tzinfo=timezone.utc)
    d1_break_e = datetime(2024, 1, 1, 14, tzinfo=timezone.utc)
    d1_out = datetime(2024, 1, 1, 18, 35, tzinfo=timezone.utc)

    # Day 2 - undertime
    d2_in = datetime(2024, 1, 2, 9, tzinfo=timezone.utc)
    d2_break_s = datetime(2024, 1, 2, 13, tzinfo=timezone.utc)
    d2_break_e = datetime(2024, 1, 2, 14, tzinfo=timezone.utc)
    d2_out = datetime(2024, 1, 2, 17, 30, tzinfo=timezone.utc)

    events = [
        (d1_in, "clockin"),
        (d1_break_s, "startbreak"),
        (d1_break_e, "endbreak"),
        (d1_out, "clockout"),
        (d2_in, "clockin"),
        (d2_break_s, "startbreak"),
        (d2_break_e, "endbreak"),
        (d2_out, "clockout"),
    ]
    for ts, kind in events:
        await client.post(
            "/events",
            params={"employee_id": "carol", "kind": kind, "timestamp": ts.isoformat()},
        )

    resp = await client.get("/summary", params={"employee_id": "carol", "month": "2024-01"})
    assert resp.status_code == 200
    data = resp.json()

    # Day 1
    assert data["hours_per_day"]["1"] == 8.58
    assert data["extra_per_day"]["1"] == 0.33
    assert data["penalty_per_day"]["1"] == 0.0
    assert data["net_per_day"]["1"] == 0.33

    # Day 2
    assert data["hours_per_day"]["2"] == 7.5
    assert data["extra_per_day"]["2"] == 3.33
    assert data["penalty_per_day"]["2"] == 0.0
    assert data["net_per_day"]["2"] == 3.33

    assert data["total_extra"] == 3.66
    assert data["total_penalty"] == 0.0
    assert data["net_time"] == 3.66


@pytest.mark.asyncio
async def test_summary_cross_midnight(client):
    start = datetime(2024, 1, 1, 19, tzinfo=timezone.utc)
    end = datetime(2024, 1, 2, 3, tzinfo=timezone.utc)
    await client.post(
        "/events",
        params={"employee_id": "dave", "kind": "clockin", "timestamp": start.isoformat()},
    )
    await client.post(
        "/events",
        params={"employee_id": "dave", "kind": "clockout", "timestamp": end.isoformat()},
    )

    resp = await client.get("/summary", params={"employee_id": "dave", "month": "2024-01"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["hours_per_day"]["1"] == 5.0
    assert data["hours_per_day"]["2"] == 3.0
    assert data["total_hours"] == 8.0


@pytest.mark.asyncio
async def test_admin_settings_affect_overtime(client):
    resp = await client.post(
        "/admin/settings", json={"key": "WORK_DAY_HOURS", "value": "10"}
    )
    assert resp.status_code == 200
    resp = await client.post(
        "/admin/settings", json={"key": "GRACE_PERIOD_MIN", "value": "30"}
    )
    assert resp.status_code == 200

    start = datetime(2024, 5, 1, 9, tzinfo=timezone.utc)
    end = datetime(2024, 5, 1, 20, 5, tzinfo=timezone.utc)
    await client.post(
        "/events",
        params={"employee_id": "eve", "kind": "clockin", "timestamp": start.isoformat()},
    )
    await client.post(
        "/events",
        params={"employee_id": "eve", "kind": "clockout", "timestamp": end.isoformat()},
    )

    resp = await client.get("/summary", params={"employee_id": "eve", "month": "2024-05"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["extra_per_day"]["1"] == 0.5
    assert data["total_extra"] == 0.5

    await client.post(
        "/admin/settings", json={"key": "WORK_DAY_HOURS", "value": "8"}
    )
    await client.post(
        "/admin/settings", json={"key": "GRACE_PERIOD_MIN", "value": "20"}
    )
