from __future__ import annotations
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Depends, Query
from sqlalchemy import select, update, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Event, AsyncSessionLocal, init_models

app = FastAPI()

@app.on_event("startup")
async def on_startup() -> None:
    await init_models()

async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

@app.post("/events", response_model=dict)
async def create_event(
    employee_id: str,
    kind: str,
    timestamp: datetime,
    session: AsyncSession = Depends(get_session),
):
    event = Event(
        employee_id=employee_id,
        kind=kind,
        timestamp=timestamp,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return {"id": event.id}

@app.get("/events", response_model=List[dict])
async def list_events(
    employee_id: Optional[str] = Query(None),
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Event)
    conditions = []
    if employee_id:
        conditions.append(Event.employee_id == employee_id)
    if month:
        year, m = map(int, month.split("-"))
        start = datetime(year, m, 1, tzinfo=timezone.utc)
        if m == 12:
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(year, m + 1, 1, tzinfo=timezone.utc)
        conditions.append(and_(Event.timestamp >= start, Event.timestamp < end))
    if conditions:
        stmt = stmt.where(*conditions)
    stmt = stmt.order_by(Event.timestamp)
    result = await session.execute(stmt)
    events = [
        {
            "id": e.id,
            "employee_id": e.employee_id,
            "kind": e.kind,
            "timestamp": e.timestamp.isoformat(),
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "updated_at": e.updated_at.isoformat() if e.updated_at else None,
        }
        for e in result.scalars()
    ]
    return events

@app.patch("/events/{event_id}", response_model=dict)
async def update_event(
    event_id: int,
    employee_id: Optional[str] = None,
    kind: Optional[str] = None,
    timestamp: Optional[datetime] = None,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Event).where(Event.id == event_id)
    result = await session.execute(stmt)
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if employee_id is not None:
        event.employee_id = employee_id
    if kind is not None:
        event.kind = kind
    if timestamp is not None:
        event.timestamp = timestamp
    await session.commit()
    await session.refresh(event)
    return {"id": event.id}

@app.delete("/events/{event_id}", response_model=dict)
async def delete_event(event_id: int, session: AsyncSession = Depends(get_session)):
    stmt = delete(Event).where(Event.id == event_id)
    result = await session.execute(stmt)
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    await session.commit()
    return {"ok": True}

# Expose app for uvicorn/gunicorn
__all__ = ["app"]
