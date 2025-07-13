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
    resp = await client.patch(f"/events/{event_id}", params={"kind": "out"})
    assert resp.status_code == 200
    assert resp.json()["id"] == event_id

    # delete
    resp = await client.delete(f"/events/{event_id}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    # confirm deletion
    resp = await client.get("/events")
    assert all(e["id"] != event_id for e in resp.json())


@pytest.mark.asyncio
async def test_not_found(client):
    resp = await client.patch("/events/9999", params={"kind": "out"})
    assert resp.status_code == 404
    resp = await client.delete("/events/9999")
    assert resp.status_code == 404
