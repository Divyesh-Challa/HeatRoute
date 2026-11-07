"""Scenario registry: which city, which weather file, which window to show."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Scenario:
    id: str
    label: str
    city: str
    station: str
    start: str  # first hour shown on the slider (local time); data before it is model spin-up
    end: str
    center: tuple[float, float]
    office: tuple[float, float]
    # (name, lat, lon) — clients are spread across these neighbourhoods
    neighbourhoods: tuple[tuple[str, float, float], ...]


EDMONTON_HOODS = (
    ("Downtown", 53.5444, -113.4909),
    ("Oliver", 53.5420, -113.5190),
    ("Old Strathcona", 53.5190, -113.4970),
    ("Alberta Avenue", 53.5700, -113.4800),
    ("Mill Woods", 53.4550, -113.4300),
    ("Castle Downs", 53.6150, -113.5200),
    ("Bonnie Doon", 53.5290, -113.4600),
    ("Beverly", 53.5720, -113.3900),
    ("Callingwood", 53.5000, -113.6200),
    ("Garneau", 53.5210, -113.5180),
    ("Clareview", 53.6000, -113.4150),
    ("Westmount", 53.5520, -113.5350),
)

TRI_CITIES_HOODS = (
    ("Coquitlam Centre", 49.2780, -122.7940),
    ("Port Coquitlam", 49.2620, -122.7810),
    ("Maple Ridge", 49.2190, -122.6010),
    ("Pitt Meadows", 49.2210, -122.6890),
    ("Port Moody", 49.2830, -122.8310),
    ("Burquitlam", 49.2600, -122.8900),
    ("New Westminster", 49.2060, -122.9110),
    ("Maillardville", 49.2450, -122.8650),
    ("Westwood Plateau", 49.2950, -122.7900),
    ("Haney", 49.2160, -122.6000),
    ("Sapperton", 49.2250, -122.8900),
    ("Citadel Heights", 49.2730, -122.7520),
)

SCENARIOS: dict[str, Scenario] = {
    s.id: s
    for s in (
        Scenario(
            id="edmonton_2024",
            label="Edmonton · July 2024 heat + wildfire smoke",
            city="Edmonton, AB",
            station="ECCC Edmonton Blatchford (temp) + Edmonton Intl A (smoke)",
            start="2024-07-15T00:00",
            end="2024-07-26T23:00",
            center=(53.5400, -113.4900),
            office=(53.5461, -113.4938),
            neighbourhoods=EDMONTON_HOODS,
        ),
        Scenario(
            id="edmonton_2021",
            label="Edmonton · June 2021 heat dome",
            city="Edmonton, AB",
            station="ECCC Edmonton Blatchford",
            start="2021-06-24T00:00",
            end="2021-07-04T23:00",
            center=(53.5400, -113.4900),
            office=(53.5461, -113.4938),
            neighbourhoods=EDMONTON_HOODS,
        ),
        Scenario(
            id="vancouver_2021",
            label="Metro Vancouver · June 2021 heat dome",
            city="Tri-Cities & Maple Ridge, BC",
            station="ECCC Pitt Meadows CS (temp) + Vancouver Intl A (smoke)",
            start="2021-06-24T00:00",
            end="2021-07-03T23:00",
            center=(49.2550, -122.7700),
            office=(49.2620, -122.7810),
            neighbourhoods=TRI_CITIES_HOODS,
        ),
    )
}

DEFAULT_SCENARIO = "edmonton_2024"
