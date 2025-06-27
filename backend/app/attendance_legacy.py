# --------------------------------------------------------------------
#  Logic ported from the original Google-Apps-Script version
# --------------------------------------------------------------------
import datetime as dt
from typing import Optional, Tuple

# --------------------------------------------------------------------
#  1.  Time helpers
# --------------------------------------------------------------------
def to_excel_time(timestr: str) -> float:
    """'HH:mm' → serial  (09:30 → 0.3958…)"""
    if not timestr or ":" not in timestr:
        return ""
    h, m = map(int, timestr.split(":", 1))
    return h / 24 + m / 1440


def _to_minutes(val) -> Optional[int]:
    """Accept serial, 'HH:mm', float-minutes or datetime → int minutes."""
    if val in (None, "", "—"):
        return None

    # numeric serial  (0-1)   or already minutes (>= 1 day)
    if isinstance(val, (int, float)):
        return round(val * 24 * 60) if val < 1 else round(val)

    # already datetime
    if isinstance(val, dt.datetime):
        return val.hour * 60 + val.minute

    # "09:45" string
    if isinstance(val, str) and ":" in val:
        h, m = map(int, val.split(":", 1))
        return h * 60 + m

    # bare number string
    try:
        v = float(val)
        return round(v * 24 * 60) if v < 1 else round(v)
    except ValueError:
        return None


def _duration_between(start, end) -> Optional[int]:
    s = _to_minutes(start)
    e = _to_minutes(end)
    if s is None or e is None or e <= s:
        return None
    return e - s


# --------------------------------------------------------------------
#  2.  Pretty printers  (exact wording as old script)
# --------------------------------------------------------------------
def fmt_h_m(total_min: int) -> str:
    return f"{total_min//60}h {total_min%60}m"


def fmt_min(total_min: int) -> str:
    return f"{total_min} min"


# --------------------------------------------------------------------
#  3.  Break & extra outcome (identical behaviour)
# --------------------------------------------------------------------
def break_outcome(start, end) -> str:
    mins = _duration_between(start, end)
    return "" if mins is None else fmt_min(mins)


def extra_outcome(start, end) -> str:
    mins = _duration_between(start, end)
    return "" if mins is None else fmt_h_m(mins)


# --------------------------------------------------------------------
#  4.  Main shift duration & outcome
# --------------------------------------------------------------------
def main_duration_and_outcome(clock_in, clock_out,
                              break_start, break_end) -> Tuple[str, str]:
    in_min  = _to_minutes(clock_in)
    out_min = _to_minutes(clock_out)
    if in_min is None or out_min is None:
        return "", ""

    # paid break: if in before 13:00 (780) and out after 14:00 (840) minus 60 m
    duration = out_min - in_min
    if in_min <= 780 and out_min >= 840:
        duration -= 60

    # penalty if break too long (> 70 m)
    penalty = 0
    b_start = _to_minutes(break_start)
    b_end   = _to_minutes(break_end)
    if b_start is not None and b_end is not None and (b_end - b_start) > 70:
        penalty -= 30

    main_outcome = -30 if duration < 480 else 0 if duration <= 510 else duration - 480
    outcome      = main_outcome + penalty
    outcome_str  = (
        f"+{outcome} min" if outcome > 0 else
        "0"              if outcome == 0 else
        f"{outcome} min"
    )
    return fmt_h_m(duration), outcome_str
