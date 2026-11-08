"""Precomputed simulation per scenario + SQLite visit log."""
from __future__ import annotations

import os
import sqlite3
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from sim.roster import Client, generate_roster
from sim.scenarios import SCENARIOS, Scenario
from sim.thermal import simulate_indoor
from sim.weather import WeatherHour, load_weather

from . import config as C
from .risk import LiveState, Visit


@dataclass
class World:
    scenario: Scenario
    weather: list[WeatherHour]
    roster: list[Client]
    by_id: dict[str, Client]
    indoor: dict[str, list[float]]
    index: dict[datetime, int]
    first_idx: int  # weather index of scenario.start
    last_idx: int


@lru_cache(maxsize=None)
def world(scenario_id: str) -> World:
    if scenario_id not in SCENARIOS:
        raise KeyError(scenario_id)
    sc = SCENARIOS[scenario_id]
    weather = load_weather(scenario_id)
    roster = generate_roster(scenario_id)
    index = {w.t: i for i, w in enumerate(weather)}
    start, end = datetime.fromisoformat(sc.start), datetime.fromisoformat(sc.end)
    return World(
        scenario=sc,
        weather=weather,
        roster=roster,
        by_id={c.id: c for c in roster},
        indoor=simulate_indoor(roster, weather),
        index=index,
        first_idx=index.get(start, 0),
        last_idx=index.get(end, len(weather) - 1),
    )


class VisitLog:
    def __init__(self, path: str | Path):
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS visits ("
            " id INTEGER PRIMARY KEY, scenario TEXT, client_id TEXT, t TEXT, outcome TEXT,"
            " created_at TEXT DEFAULT CURRENT_TIMESTAMP)"
        )
        self._db.commit()

    def add(self, scenario: str, client_id: str, t: datetime, outcome: str) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO visits (scenario, client_id, t, outcome) VALUES (?, ?, ?, ?)",
                (scenario, client_id, t.strftime("%Y-%m-%dT%H:%M"), outcome),
            )
            self._db.commit()

    def all(self, scenario: str) -> list[Visit]:
        with self._lock:
            rows = self._db.execute(
                "SELECT client_id, t, outcome FROM visits WHERE scenario = ? ORDER BY id", (scenario,)
            ).fetchall()
        return [Visit(c, datetime.fromisoformat(t), o) for c, t, o in rows]

    def reset(self, scenario: str | None = None) -> None:
        with self._lock:
            if scenario:
                self._db.execute("DELETE FROM visits WHERE scenario = ?", (scenario,))
            else:
                self._db.execute("DELETE FROM visits")
            self._db.commit()


def default_db_path() -> str:
    return os.environ.get("HEATROUTE_DB", str(Path(__file__).resolve().parent.parent / "heatroute.db"))


def now() -> float:
    """Wall clock for live devices. Tests monkeypatch this."""
    return time.time()


class LiveLog:
    """Readings and button presses from live devices, plus coordinator check-in requests."""

    def __init__(self, path: str | Path):
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.executescript(
            "CREATE TABLE IF NOT EXISTS live_events ("
            " id INTEGER PRIMARY KEY, device_id TEXT, kind TEXT, value REAL, received_at REAL);"
            "CREATE TABLE IF NOT EXISTS prompts ("
            " id INTEGER PRIMARY KEY, client_id TEXT, requested_at REAL, answered_at REAL);"
        )
        self._db.commit()

    def add(self, device_id: str, kind: str, value: float | None = None) -> None:
        """kind: hr | ok | help | ping | clear. A button press answers any open check-in request."""
        t = now()
        with self._lock:
            self._db.execute(
                "INSERT INTO live_events (device_id, kind, value, received_at) VALUES (?, ?, ?, ?)",
                (device_id, kind, value, t),
            )
            if kind in ("ok", "help", "clear"):
                self._db.execute("UPDATE prompts SET answered_at = ? WHERE answered_at IS NULL", (t,))
            self._db.commit()

    def request_checkin(self, client_id: str) -> None:
        with self._lock:
            self._db.execute("UPDATE prompts SET answered_at = ? WHERE answered_at IS NULL", (now(),))
            self._db.execute("INSERT INTO prompts (client_id, requested_at) VALUES (?, ?)", (client_id, now()))
            self._db.commit()

    def state(self) -> LiveState:
        t = now()
        with self._lock:
            hr = self._db.execute(
                "SELECT value, received_at FROM live_events WHERE kind = 'hr' ORDER BY id DESC LIMIT 1"
            ).fetchone()
            btn = self._db.execute(
                "SELECT kind, received_at FROM live_events WHERE kind IN ('ok', 'help', 'clear') ORDER BY id DESC LIMIT 1"
            ).fetchone()
            seen = self._db.execute("SELECT MAX(received_at) FROM live_events WHERE device_id != 'coordinator'").fetchone()[0]
            prompt = self._db.execute(
                "SELECT requested_at FROM prompts WHERE answered_at IS NULL ORDER BY id DESC LIMIT 1"
            ).fetchone()
        checkin = btn[0] if btn and btn[0] != "clear" else None
        waited = t - prompt[0] if prompt else None
        return LiveState(
            hr_bpm=hr[0] if hr else None,
            hr_age_s=round(t - hr[1], 1) if hr else None,
            checkin=checkin,
            checkin_age_s=round(t - btn[1], 1) if checkin else None,
            prompt_pending=waited is not None and waited < C.PROMPT_TIMEOUT_S,
            prompt_seconds_left=round(C.PROMPT_TIMEOUT_S - waited, 1) if waited is not None and waited < C.PROMPT_TIMEOUT_S else None,
            prompt_missed=waited is not None and waited >= C.PROMPT_TIMEOUT_S,
            online=seen is not None and t - seen <= C.DEVICE_ONLINE_S,
        )

    def devices(self) -> list[dict]:
        t = now()
        with self._lock:
            rows = self._db.execute(
                "SELECT device_id, MAX(received_at) FROM live_events WHERE device_id != 'coordinator' GROUP BY device_id"
            ).fetchall()
        return [{"device_id": d, "last_seen_s": round(t - s, 1), "online": t - s <= C.DEVICE_ONLINE_S} for d, s in rows]

    def hr_history(self) -> list[dict]:
        t = now()
        with self._lock:
            rows = self._db.execute(
                "SELECT value, received_at FROM live_events WHERE kind = 'hr' AND received_at >= ? ORDER BY id",
                (t - C.HR_HISTORY_S,),
            ).fetchall()
        return [{"age_s": round(t - at, 1), "bpm": round(v)} for v, at in rows]

    def rev(self) -> int:
        with self._lock:
            a = self._db.execute("SELECT COALESCE(MAX(id), 0) FROM live_events").fetchone()[0]
            b = self._db.execute("SELECT COALESCE(MAX(id), 0) FROM prompts").fetchone()[0]
            answered = self._db.execute("SELECT COUNT(answered_at) FROM prompts").fetchone()[0]
        return a * 1000 + b * 10 + answered

    def reset(self) -> None:
        with self._lock:
            self._db.execute("DELETE FROM live_events")
            self._db.execute("DELETE FROM prompts")
            self._db.commit()
