"""First-order indoor temperature model, one Euler step per hour.

T_in[t+1] = T_in[t] + (T_out[t] - T_in[t]) / tau_eff + solar(t) + internal - AC

tau_eff is the building's time constant. When it is cooler outside than inside,
people open windows and the home cools faster (tau × OPEN_WINDOW). During
wildfire smoke, public health advice is to keep windows shut, so that night
flushing is lost (tau × SMOKE_CLOSED). That single switch is how smoke turns a
hot night into a dangerous one for homes without AC.
"""
from __future__ import annotations

import math

from .roster import Client
from .weather import WeatherHour

TAU_HOURS = {"poor": 6.0, "average": 10.0, "good": 14.0}
OPEN_WINDOW = 1.0  # windows open at night: normal ventilation
SMOKE_CLOSED = 2.0  # windows shut for smoke: night flushing mostly lost
SOLAR_PEAK_C_PER_H = 0.32  # heating rate at 14:00 for a mid-floor east-facing average home
SOLAR_ORIENTATION = {"N": 0.5, "E": 0.9, "S": 1.3, "W": 1.4}
SOLAR_INSULATION = {"poor": 1.3, "average": 1.0, "good": 0.65}
TOP_FLOOR_FACTOR = 1.8  # roof gain + rising heat
INTERNAL_GAIN = 0.08  # people, appliances
STACK_GAIN_PER_FLOOR = 0.025  # heat rising from units below, per floor up to STACK_MAX_FLOORS
STACK_MAX_FLOORS = 8
AC_SETPOINT = 24.5
START_C = 22.0
MIN_C, MAX_C = 15.0, 45.0


def solar_gain(hour: int, client: Client) -> float:
    if not 6 <= hour <= 20:
        return 0.0
    shape = math.sin(math.pi * (hour - 6) / 14) ** 1.5  # 0 at 06:00 and 20:00, peak ~13–14:00
    factor = SOLAR_ORIENTATION[client.orientation] * SOLAR_INSULATION[client.insulation]
    if client.top_floor:
        factor *= TOP_FLOOR_FACTOR
    return SOLAR_PEAK_C_PER_H * shape * factor


def step(t_in: float, w: WeatherHour, client: Client) -> float:
    tau = TAU_HOURS[client.insulation]
    if w.outdoor_c < t_in:
        tau *= SMOKE_CLOSED if w.smoke else OPEN_WINDOW
    stack = STACK_GAIN_PER_FLOOR * min(client.floor, STACK_MAX_FLOORS)
    t_next = t_in + (w.outdoor_c - t_in) / tau + solar_gain(w.t.hour, client) + INTERNAL_GAIN + stack
    if client.has_ac:
        t_next = min(t_next, AC_SETPOINT)
    return max(MIN_C, min(MAX_C, t_next))


def simulate_indoor(roster: list[Client], weather: list[WeatherHour]) -> dict[str, list[float]]:
    """Indoor °C for every client, aligned index-for-index with `weather`."""
    out: dict[str, list[float]] = {}
    for c in roster:
        temps, t_in = [], START_C
        for w in weather:
            temps.append(round(t_in, 2))
            t_in = step(t_in, w, c)
        out[c.id] = temps
    return out
