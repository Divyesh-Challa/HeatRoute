"""Risk engine: pure functions from (client, indoor temps, weather, visits) to a ranked row.

Nothing here touches the database or the web layer, so every rule is unit-tested
in isolation.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sim.roster import Client
from sim.weather import WeatherHour

from . import config as C


@dataclass(frozen=True)
class Visit:
    client_id: str
    t: datetime
    outcome: str  # ok | moved_to_cooling | called_911


@dataclass
class Assessment:
    score: float
    band: str
    indoor_c: float
    hours_above_26: int
    hours_above_31: int
    escalated: bool
    reasons: list[str]
    status: str
    last_visit: Visit | None
    breakdown: dict = field(default_factory=dict)


def exposure(temps: list[float], hours: list[datetime]) -> tuple[float, bool]:
    """Degree-hours above the warm/danger thresholds, plus an overnight bonus.

    Returns (exposure, hot_night). hot_night means every night hour in the window
    stayed at or above T_WARM, so the body never got a chance to recover.
    """
    e = sum(max(0.0, t - C.T_WARM) + 2 * max(0.0, t - C.T_DANGER) for t in temps)
    night = [t for t, h in zip(temps, hours) if h.hour in C.NIGHT_HOURS]
    hot_night = bool(night) and min(night) >= C.T_WARM
    if hot_night:
        e += C.NIGHT_BONUS
    return e, hot_night


def smoke_sensitive(client: Client) -> list[str]:
    return [c for c in client.conditions if c in C.SMOKE_SENSITIVE]


def vulnerability(client: Client, smoke_recent: bool) -> tuple[int, list[tuple[int, str]]]:
    """Total points and (weight, label) factors for building reasons."""
    w = C.VULNERABILITY
    factors: list[tuple[int, str]] = []
    if client.age >= 85:
        factors.append((w["age_85"], f"age {client.age}"))
    elif client.age >= 70:
        factors.append((w["age_70"], f"age {client.age}"))
    if client.lives_alone:
        factors.append((w["lives_alone"], "lives alone"))
    if not client.has_ac:
        factors.append((w["no_ac"], "no AC"))
    for cond in client.conditions[: w["max_conditions"]]:
        factors.append((w["per_condition"], cond))
    if client.mobility_limited:
        factors.append((w["mobility_limited"], "limited mobility"))
    if client.cognitive_impairment:
        factors.append((w["cognitive_impairment"], "cognitive impairment"))
    sensitive = smoke_sensitive(client)
    if smoke_recent and sensitive:
        factors.append((w["smoke_sensitive"], f"smoke + {sensitive[0]}"))
    return sum(p for p, _ in factors), factors


def consecutive_above(temps: list[float], threshold: float) -> int:
    """How many of the most recent hours in a row were at or above threshold."""
    n = 0
    for t in reversed(temps):
        if t < threshold:
            break
        n += 1
    return n


def longest_run_above(temps: list[float], threshold: float) -> int:
    best = run = 0
    for t in temps:
        run = run + 1 if t >= threshold else 0
        best = max(best, run)
    return best


def exposure_norm(e: float) -> float:
    """0..1, saturating smoothly so the hottest homes still rank among themselves."""
    return 1 - math.exp(-e / C.EXPOSURE_SCALE)


def score_from(e: float, v: int) -> float:
    e_norm = exposure_norm(e)
    return round(min(100.0, 100 * e_norm * (1 + v / 5) / C.SCORE_DIVISOR), 1)


def band_for(score: float, escalated: bool) -> str:
    if escalated or score >= C.BAND_RED:
        return "red"
    if score >= C.BAND_AMBER:
        return "amber"
    return "green"


def latest_visit(visits: list[Visit], client_id: str, now: datetime) -> Visit | None:
    """Most recent visit for this client logged at or before `now` (the slider can move back)."""
    mine = [v for v in visits if v.client_id == client_id and v.t <= now]
    return max(mine, key=lambda v: v.t) if mine else None


def cooling_until(v: Visit) -> datetime:
    next_day = (v.t + timedelta(days=1)).replace(hour=C.COOLING_RESUME_HOUR, minute=0)
    return next_day


def effective_temps(temps: list[float], hours: list[datetime], visit: Visit | None) -> list[float]:
    """Indoor temps the client actually experienced: a cooling centre replaces home temps."""
    if not visit or visit.outcome != "moved_to_cooling":
        return temps
    end = cooling_until(visit)
    return [C.COOLING_CENTRE_C if visit.t <= h < end else t for t, h in zip(temps, hours)]


def temp_reason(indoor: float, h26: int, h31: int, run31: int) -> str | None:
    if run31 >= C.ESCALATE_CONSECUTIVE_H:
        return f"{indoor:.1f}°C, {run31} h straight above 31°C"
    if h31:
        return f"{indoor:.1f}°C now · {h31} h above 31°C"
    if h26:
        return f"{indoor:.1f}°C now · {h26} h above 26°C"
    return None


def assess(
    client: Client,
    indoor: list[float],
    weather: list[WeatherHour],
    idx: int,
    visits: list[Visit],
) -> Assessment:
    """Risk for one client at weather index `idx` (inclusive)."""
    lo = max(0, idx - C.EXPOSURE_WINDOW_H + 1)
    hours = [w.t for w in weather[lo : idx + 1]]
    now = weather[idx].t
    visit = latest_visit(visits, client.id, now)
    temps = effective_temps(indoor[lo : idx + 1], hours, visit)

    e, hot_night = exposure(temps, hours)
    smoke_lo = max(0, idx - C.SMOKE_LOOKBACK_H + 1)
    smoke_recent = any(w.smoke for w in weather[smoke_lo : idx + 1])
    v, factors = vulnerability(client, smoke_recent)
    score = score_from(e, v)

    h26 = sum(t > C.T_WARM for t in temps)
    h31 = sum(t >= C.T_DANGER for t in temps)
    run31 = consecutive_above(temps, C.T_DANGER)
    # Any 3 h run at ≥31°C in the window counts: a cooler morning doesn't undo yesterday.
    escalated = longest_run_above(temps, C.T_DANGER) >= C.ESCALATE_CONSECUTIVE_H and client.lives_alone

    status = "needs_visit"
    if visit:
        if visit.outcome == "called_911":
            status, score, escalated = "escalated", 0.0, False
        elif visit.outcome == "moved_to_cooling" and now < cooling_until(visit):
            status = "relocated"
        elif visit.outcome == "ok" and now < visit.t + timedelta(hours=C.OK_DEPRIORITIZE_H):
            status, escalated = "visited_ok", False
            score = round(score * C.OK_SCORE_FACTOR, 1)

    band = "unknown" if status == "escalated" else band_for(score, escalated)

    reasons: list[str] = []
    if status == "relocated":
        reasons.append("at cooling centre")
    tr = temp_reason(temps[-1], h26, h31, run31)
    if tr and status != "relocated":
        reasons.append(tr)
    smoke_factor = [label for _, label in factors if label.startswith("smoke")]
    if e > 0:
        reasons += smoke_factor
    if hot_night:
        reasons.append("no relief overnight")
    # Remaining person factors, heaviest first; ties keep the natural order.
    rest = [label for _, label in sorted(factors, key=lambda f: -f[0]) if not label.startswith("smoke")]
    reasons += rest
    reasons = reasons[:4]

    return Assessment(
        score=score,
        band=band,
        indoor_c=round(temps[-1], 1),
        hours_above_26=h26,
        hours_above_31=h31,
        escalated=escalated,
        reasons=reasons,
        status=status,
        last_visit=visit,
        breakdown={
            "exposure": round(e, 1),
            "exposure_norm": round(exposure_norm(e), 2),
            "vulnerability": v,
            "smoke_bonus": C.VULNERABILITY["smoke_sensitive"] if smoke_factor else 0,
            "hot_night": hot_night,
            "factors": [{"label": label, "points": p} for p, label in factors],
        },
    )


def queue_key(a: Assessment) -> tuple:
    """Sort order for the coordinator's list: open cases first, escalated rule-hits on top."""
    open_case = a.status == "needs_visit"
    return (not open_case, not a.escalated, -a.score, -a.breakdown.get("vulnerability", 0))
