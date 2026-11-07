"""Build data/weather_<scenario>.csv from Environment Canada hourly bulk data.

Usage: python data/fetch_weather.py

Temperature comes from one station, the smoke flag from another station that
records present weather (only staffed/automated airport stations do). ECCC
timestamps are Local Standard Time; we add 1 h to convert to local daylight
time, which is what a coordinator's clock shows in summer.
"""
from __future__ import annotations

import csv
import io
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

URL = (
    "https://climate.weather.gc.ca/climate_data/bulk_data_e.html"
    "?format=csv&stationID={sid}&Year={y}&Month={m}&Day=1&timeframe=1&submit=Download+Data"
)

# scenario id -> (temperature station, smoke station, first day, last day) in local time
SOURCES = {
    "edmonton_2024": (27214, 50149, "2024-07-12", "2024-07-26"),
    "edmonton_2021": (27214, 50149, "2021-06-21", "2021-07-04"),
    "vancouver_2021": (6830, 51442, "2021-06-21", "2021-07-03"),
}

OUT = Path(__file__).parent


def fetch(sid: int, year: int, month: int) -> list[dict[str, str]]:
    with urllib.request.urlopen(URL.format(sid=sid, y=year, m=month), timeout=60) as r:
        text = r.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def hourly(sid: int, months: set[tuple[int, int]]) -> dict[datetime, dict[str, str]]:
    out = {}
    for y, m in sorted(months):
        for row in fetch(sid, y, m):
            t = datetime.strptime(row["Date/Time (LST)"], "%Y-%m-%d %H:%M") + timedelta(hours=1)
            out[t] = row
    return out


def build(scenario: str) -> Path:
    temp_sid, smoke_sid, first, last = SOURCES[scenario]
    start = datetime.fromisoformat(first)
    end = datetime.fromisoformat(last) + timedelta(hours=23)
    months = {(start.year, start.month), (end.year, end.month)}
    temps = hourly(temp_sid, months)
    wx = hourly(smoke_sid, months)

    path = OUT / f"weather_{scenario}.csv"
    rows, last_temp, t = [], None, start
    while t <= end:
        raw = temps.get(t, {}).get("Temp (°C)", "")
        temp = float(raw) if raw else last_temp  # carry forward the rare gap
        if temp is None:
            raise ValueError(f"{scenario}: no temperature at {t}")
        weather = wx.get(t, {}).get("Weather", "") or ""
        smoke = int("Smoke" in weather or "Haze" in weather)
        rows.append((t.strftime("%Y-%m-%dT%H:%M"), f"{temp:.1f}", smoke))
        last_temp, t = temp, t + timedelta(hours=1)

    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "outdoor_c", "smoke"])
        w.writerows(rows)
    return path


if __name__ == "__main__":
    for s in SOURCES:
        p = build(s)
        print("wrote", p)
