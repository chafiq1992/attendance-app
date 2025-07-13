from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict
import calendar

from fastapi import FastAPI, HTTPException, Depends, Query
from pydantic import BaseModel
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


class EventUpdate(BaseModel):
    employee_id: Optional[str] | None = None
    kind: Optional[str] | None = None
    timestamp: Optional[datetime] | None = None

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
    payload: EventUpdate,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Event).where(Event.id == event_id)
    result = await session.execute(stmt)
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if payload.employee_id is not None:
        event.employee_id = payload.employee_id
    if payload.kind is not None:
        event.kind = payload.kind
    if payload.timestamp is not None:
        event.timestamp = payload.timestamp
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


def _summarize_events(events: List[Event], year: int, month: int) -> Dict[str, object]:
    days_in_month = calendar.monthrange(year, month)[1]
    hours_per_day: Dict[str, float] = {str(d): 0.0 for d in range(1, days_in_month + 1)}
    present_days = set()

    by_day: Dict[int, List[Event]] = {}
    for e in events:
        day = e.timestamp.astimezone(timezone.utc).day
        by_day.setdefault(day, []).append(e)

    for day, evts in by_day.items():
        evts.sort(key=lambda e: e.timestamp)
        clock_in: datetime | None = None
        total_seconds = 0.0
        for ev in evts:
            k = ev.kind
            if k in {"clockin", "in"}:
                clock_in = ev.timestamp
            elif k in {"clockout", "out"} and clock_in:
                total_seconds += (ev.timestamp - clock_in).total_seconds()
                clock_in = None
        if total_seconds > 0:
            present_days.add(day)
            hours_per_day[str(day)] = round(total_seconds / 3600, 2)

    attendance_rate = len(present_days) / days_in_month if days_in_month else 0
    total_hours = round(sum(hours_per_day.values()), 2)
    return {
        "attendance_rate": attendance_rate,
        "hours_per_day": hours_per_day,
        "total_hours": total_hours,
    }


@app.get("/summary", response_model=dict)
async def get_summary(
    employee_id: str = Query(...),
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    session: AsyncSession = Depends(get_session),
):
    year, m = map(int, month.split("-"))
    start = datetime(year, m, 1, tzinfo=timezone.utc)
    end_month = m + 1 if m < 12 else 1
    end_year = year if m < 12 else year + 1
    end = datetime(end_year, end_month, 1, tzinfo=timezone.utc)

    stmt = (
        select(Event)
        .where(
            Event.employee_id == employee_id,
            Event.timestamp >= start,
            Event.timestamp < end,
        )
        .order_by(Event.timestamp)
    )
    result = await session.execute(stmt)
    events = list(result.scalars())

    summary = _summarize_events(events, year, m)
    return summary

# Expose app for uvicorn/gunicorn
__all__ = ["app"]
