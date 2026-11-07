"""Hourly outdoor weather per scenario: real ECCC data, synthetic fallback."""
from __future__ import annotations

import csv
import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from .scenarios import SCENARIOS

log = logging.getLogger(__name__)
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SPINUP_HOURS = 72
# ECCC only reports present weather some hours; an observed smoke hour keeps the
# advisory (and closed windows) in effect for this many hours.
SMOKE_PERSIST_HOURS = 12


@dataclass(frozen=True)
class WeatherHour:
    t: datetime
    outdoor_c: float
    smoke: bool


def load_weather(scenario_id: str, data_dir: Path = DATA_DIR) -> list[WeatherHour]:
    """Hourly weather for the scenario, including spin-up hours before its start."""
    path = data_dir / f"weather_{scenario_id}.csv"
    if not path.exists():
        log.warning("%s missing; using synthetic heat-wave curve", path)
        return synthetic_weather(scenario_id)
    hours = []
    with path.open() as f:
        for row in csv.DictReader(f):
            temp = max(-40.0, min(50.0, float(row["outdoor_c"])))
            hours.append(WeatherHour(datetime.fromisoformat(row["timestamp"]), temp, row.get("smoke") == "1"))
    return persist_smoke(hours)


def persist_smoke(hours: list[WeatherHour], persist: int = SMOKE_PERSIST_HOURS) -> list[WeatherHour]:
    out, since = [], persist + 1
    for h in hours:
        since = 0 if h.smoke else since + 1
        out.append(WeatherHour(h.t, h.outdoor_c, since <= persist))
    return out


def synthetic_weather(scenario_id: str) -> list[WeatherHour]:
    """Plausible heat wave: highs ramp to ~38°C mid-window, lows 18–24°C."""
    sc = SCENARIOS[scenario_id]
    start = datetime.fromisoformat(sc.start) - timedelta(hours=SPINUP_HOURS)
    end = datetime.fromisoformat(sc.end)
    n_days = (end - start).days + 1
    hours, t = [], start
    while t <= end:
        day = (t - start).days
        peak = math.exp(-(((day - n_days * 0.55) / (n_days * 0.22)) ** 2))  # 0..1 bell over the window
        high, low = 25 + 13 * peak, 14 + 9 * peak
        diurnal = (math.cos(2 * math.pi * (t.hour - 16) / 24) + 1) / 2  # 1 at 16:00, 0 at 04:00
        hours.append(WeatherHour(t, round(low + (high - low) * diurnal, 1), False))
        t += timedelta(hours=1)
    return hours
