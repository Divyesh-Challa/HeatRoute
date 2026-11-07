"""Precomputed simulation per scenario + SQLite visit log."""
from __future__ import annotations

import os
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from sim.roster import Client, generate_roster
from sim.scenarios import SCENARIOS, Scenario
from sim.thermal import simulate_indoor
from sim.weather import WeatherHour, load_weather

from .risk import Visit


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
