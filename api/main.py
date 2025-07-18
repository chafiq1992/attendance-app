from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Tuple
import calendar

from fastapi import FastAPI, HTTPException, Depends, Query, Body
from pydantic import BaseModel
from sqlalchemy import select, update, delete, insert, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    Event,
    Setting,
    AdminUser,
    AdminLog,
    AsyncSessionLocal,
    init_models,
)

app = FastAPI()

# ---------------------------------------------------------------------------
# Attendance calculation settings
# ---------------------------------------------------------------------------
# Daily required work hours
WORK_DAY_HOURS = 8
# Extra time grace period in minutes
GRACE_PERIOD_MIN = 20
# Penalty added to missing time in minutes
UNDER_TIME_PENALTY_MIN = 15

@app.on_event("startup")
async def on_startup() -> None:
    await init_models()
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Setting))
        rows = result.scalars().all()
        for row in rows:
            if row.key == "WORK_DAY_HOURS":
                global WORK_DAY_HOURS
                WORK_DAY_HOURS = float(row.value)
            elif row.key == "GRACE_PERIOD_MIN":
                global GRACE_PERIOD_MIN
                GRACE_PERIOD_MIN = float(row.value)
            elif row.key == "UNDER_TIME_PENALTY_MIN":
                global UNDER_TIME_PENALTY_MIN
                UNDER_TIME_PENALTY_MIN = float(row.value)

async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


class EventPayload(BaseModel):
    employee_id: str
    kind: str
    timestamp: datetime


class EventUpdate(BaseModel):
    employee_id: Optional[str] | None = None
    kind: Optional[str] | None = None
    timestamp: Optional[datetime] | None = None

@app.post("/events", response_model=dict)
async def create_event(
    employee_id: Optional[str] = Query(None),
    kind: Optional[str] = Query(None),
    timestamp: Optional[datetime] = Query(None),
    payload: EventPayload | None = Body(None),
    session: AsyncSession = Depends(get_session),
):
    if payload is not None:
        employee_id = payload.employee_id
        kind = payload.kind
        timestamp = payload.timestamp
    if employee_id is None or kind is None or timestamp is None:
        raise HTTPException(status_code=422, detail="employee_id, kind and timestamp required")
    event = Event(
        employee_id=employee_id,
        kind=kind,
        timestamp=timestamp,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    await session.execute(
        insert(AdminLog).values(action="create_event", data=f"{employee_id}:{kind}")
    )
    await session.commit()
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
    rows = result.scalars().all()
    events = [
        {
            "id": e.id,
            "employee_id": e.employee_id,
            "kind": e.kind,
            "timestamp": e.timestamp.isoformat(),
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "updated_at": e.updated_at.isoformat() if e.updated_at else None,
        }
        for e in rows
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
    await session.execute(
        insert(AdminLog).values(action="update_event", data=str(event_id))
    )
    await session.commit()
    return {"id": event.id}

@app.delete("/events/{event_id}", response_model=dict)
async def delete_event(event_id: int, session: AsyncSession = Depends(get_session)):
    stmt = delete(Event).where(Event.id == event_id)
    result = await session.execute(stmt)
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    await session.commit()
    await session.execute(
        insert(AdminLog).values(action="delete_event", data=str(event_id))
    )
    await session.commit()
    return {"ok": True}


def _compute_metrics_from_seconds(seconds: float) -> Dict[str, float]:
    """Return worked, extra, penalty and net hours for the given seconds."""

    worked_hours = seconds / 3600
    extra_seconds = 0.0

    work_seconds = WORK_DAY_HOURS * 3600
    grace_seconds = GRACE_PERIOD_MIN * 60
    half_work_seconds = (WORK_DAY_HOURS / 2) * 3600

    if seconds >= 60:
        if seconds >= work_seconds:
            if seconds > work_seconds + grace_seconds:
                extra_seconds = seconds - (work_seconds + grace_seconds)
        elif seconds > half_work_seconds + grace_seconds:
            extra_seconds = seconds - half_work_seconds

    block = GRACE_PERIOD_MIN * 60
    extra_seconds = round(extra_seconds / block) * block

    return {
        "worked_hours": worked_hours,
        "extra_hours": extra_seconds / 3600,
        "penalty_hours": 0.0,
        "net_hours": extra_seconds / 3600,
    }


def _extract_work_segments(events: List[Event]) -> List[Tuple[datetime, datetime]]:
    """Return continuous work segments from ordered events."""
    events.sort(key=lambda e: e.timestamp)
    segments: List[Tuple[datetime, datetime]] = []
    state = "off"
    start: datetime | None = None

    for ev in events:
        k = ev.kind
        if k in {"clockin", "in"} and state == "off":
            state = "working"
            start = ev.timestamp
        elif k == "startbreak" and state == "working" and start is not None:
            segments.append((start, ev.timestamp))
            state = "break"
        elif k == "endbreak" and state == "break":
            state = "working"
            start = ev.timestamp
        elif k in {"clockout", "out"} and start is not None:
            if state == "working":
                segments.append((start, ev.timestamp))
            state = "off"
            start = None

    return segments


def _summarize_events(events: List[Event], year: int, month: int) -> Dict[str, object]:
    days_in_month = calendar.monthrange(year, month)[1]
    hours_per_day: Dict[str, float] = {str(d): 0.0 for d in range(1, days_in_month + 1)}
    extras_per_day: Dict[str, float] = {str(d): 0.0 for d in range(1, days_in_month + 1)}
    penalties_per_day: Dict[str, float] = {str(d): 0.0 for d in range(1, days_in_month + 1)}
    net_per_day: Dict[str, float] = {str(d): 0.0 for d in range(1, days_in_month + 1)}
    present_days = set()

    segments = _extract_work_segments(events)
    daily_seconds: Dict[int, float] = {d: 0.0 for d in range(1, days_in_month + 1)}

    for start, end in segments:
        cur = start
        while cur.date() != end.date():
            midnight = datetime.combine(cur.date(), datetime.min.time(), tzinfo=cur.tzinfo) + timedelta(days=1)
            seconds = (midnight - cur).total_seconds()
            if cur.month == month:
                daily_seconds[cur.day] += seconds
            cur = midnight
        if cur.month == month:
            daily_seconds[cur.day] += (end - cur).total_seconds()

    for day, secs in daily_seconds.items():
        metrics = _compute_metrics_from_seconds(secs)
        if metrics["worked_hours"] > 0:
            present_days.add(day)
        hours_per_day[str(day)] = round(metrics["worked_hours"], 2)
        extras_per_day[str(day)] = round(metrics["extra_hours"], 2)
        penalties_per_day[str(day)] = round(metrics["penalty_hours"], 2)
        net_per_day[str(day)] = round(metrics["net_hours"], 2)

    attendance_rate = len(present_days) / days_in_month if days_in_month else 0
    total_hours = round(sum(hours_per_day.values()), 2)
    total_extra = round(sum(extras_per_day.values()), 2)
    total_penalty = round(sum(penalties_per_day.values()), 2)
    net_time = round(total_extra - total_penalty, 2)
    return {
        "attendance_rate": attendance_rate,
        "hours_per_day": hours_per_day,
        "total_hours": total_hours,
        "extra_per_day": extras_per_day,
        "penalty_per_day": penalties_per_day,
        "net_per_day": net_per_day,
        "total_extra": total_extra,
        "total_penalty": total_penalty,
        "net_time": net_time,
    }


def _summarize_range(events: List[Event], start: datetime, end: datetime) -> Dict[str, object]:
    """Summarize events between arbitrary start and end datetimes."""
    num_days = (end.date() - start.date()).days
    hours_per_day: Dict[str, float] = {str(d + 1): 0.0 for d in range(num_days)}
    extras_per_day: Dict[str, float] = {str(d + 1): 0.0 for d in range(num_days)}
    penalties_per_day: Dict[str, float] = {str(d + 1): 0.0 for d in range(num_days)}
    net_per_day: Dict[str, float] = {str(d + 1): 0.0 for d in range(num_days)}
    present_days = set()

    segments = _extract_work_segments(events)
    daily_seconds: Dict[int, float] = {d + 1: 0.0 for d in range(num_days)}

    for start_seg, end_seg in segments:
        cur = start_seg
        while cur.date() != end_seg.date():
            midnight = datetime.combine(cur.date(), datetime.min.time(), tzinfo=cur.tzinfo) + timedelta(days=1)
            seconds = (midnight - cur).total_seconds()
            day_index = (cur.date() - start.date()).days
            if 0 <= day_index < num_days:
                daily_seconds[day_index + 1] += seconds
            cur = midnight
        day_index = (cur.date() - start.date()).days
        if 0 <= day_index < num_days:
            daily_seconds[day_index + 1] += (end_seg - cur).total_seconds()

    for idx, secs in daily_seconds.items():
        metrics = _compute_metrics_from_seconds(secs)
        if metrics["worked_hours"] > 0:
            present_days.add(idx)
        hours_per_day[str(idx)] = round(metrics["worked_hours"], 2)
        extras_per_day[str(idx)] = round(metrics["extra_hours"], 2)
        penalties_per_day[str(idx)] = round(metrics["penalty_hours"], 2)
        net_per_day[str(idx)] = round(metrics["net_hours"], 2)

    attendance_rate = len(present_days) / num_days if num_days else 0
    total_hours = round(sum(hours_per_day.values()), 2)
    total_extra = round(sum(extras_per_day.values()), 2)
    total_penalty = round(sum(penalties_per_day.values()), 2)
    net_time = round(total_extra - total_penalty, 2)
    return {
        "attendance_rate": attendance_rate,
        "hours_per_day": hours_per_day,
        "total_hours": total_hours,
        "extra_per_day": extras_per_day,
        "penalty_per_day": penalties_per_day,
        "net_per_day": net_per_day,
        "total_extra": total_extra,
        "total_penalty": total_penalty,
        "net_time": net_time,
    }


@app.get("/summary", response_model=dict)
async def get_summary(
    employee_id: str = Query(...),
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
):
    if month:
        year, m = map(int, month.split("-"))
        start_dt = datetime(year, m, 1, tzinfo=timezone.utc)
        end_month = m + 1 if m < 12 else 1
        end_year = year if m < 12 else year + 1
        end_dt = datetime(end_year, end_month, 1, tzinfo=timezone.utc)
    elif start and end:
        start_dt = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
    else:
        raise HTTPException(status_code=400, detail="month or start/end required")

    stmt = (
        select(Event)
        .where(
            Event.employee_id == employee_id,
            Event.timestamp >= start_dt,
            Event.timestamp < end_dt,
        )
        .order_by(Event.timestamp)
    )
    result = await session.execute(stmt)
    events = result.scalars().all()

    if month:
        summary = _summarize_events(events, start_dt.year, start_dt.month)
    else:
        summary = _summarize_range(events, start_dt, end_dt)
    return summary


class SettingPayload(BaseModel):
    key: str
    value: str


class UserPayload(BaseModel):
    username: str


class LogPayload(BaseModel):
    action: str
    data: Optional[str] | None = None


@app.get("/admin/settings", response_model=dict)
async def get_settings(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Setting))
    rows = result.scalars().all()
    return {row.key: row.value for row in rows}


@app.post("/admin/settings", response_model=dict)
async def set_setting(payload: SettingPayload, session: AsyncSession = Depends(get_session)):
    stmt = update(Setting).where(Setting.key == payload.key).values(value=payload.value)
    result = await session.execute(stmt)
    if result.rowcount == 0:
        session.add(Setting(key=payload.key, value=payload.value))
    await session.commit()
    if payload.key == "WORK_DAY_HOURS":
        global WORK_DAY_HOURS
        WORK_DAY_HOURS = float(payload.value)
    elif payload.key == "GRACE_PERIOD_MIN":
        global GRACE_PERIOD_MIN
        GRACE_PERIOD_MIN = float(payload.value)
    elif payload.key == "UNDER_TIME_PENALTY_MIN":
        global UNDER_TIME_PENALTY_MIN
        UNDER_TIME_PENALTY_MIN = float(payload.value)
    return {"ok": True}


@app.get("/admin/users", response_model=List[dict])
async def list_admins(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(AdminUser))
    users = result.scalars().all()
    return [{"id": u.id, "username": u.username} for u in users]


@app.post("/admin/users", response_model=dict)
async def add_admin(payload: UserPayload, session: AsyncSession = Depends(get_session)):
    user = AdminUser(username=payload.username)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return {"id": user.id}


@app.delete("/admin/users/{user_id}", response_model=dict)
async def delete_admin(user_id: int, session: AsyncSession = Depends(get_session)):
    stmt = delete(AdminUser).where(AdminUser.id == user_id)
    result = await session.execute(stmt)
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await session.commit()
    return {"ok": True}


@app.get("/admin/logs", response_model=List[dict])
async def list_logs(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(AdminLog).order_by(AdminLog.created_at.desc()).limit(100)
    )
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "action": l.action,
            "data": l.data,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]


@app.post("/admin/logs", response_model=dict)
async def create_log(payload: LogPayload, session: AsyncSession = Depends(get_session)):
    log = AdminLog(action=payload.action, data=payload.data)
    session.add(log)
    await session.commit()
    await session.refresh(log)
    return {"id": log.id}

# Expose app for uvicorn/gunicorn
__all__ = ["app"]
