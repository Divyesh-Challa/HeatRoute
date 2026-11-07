"""Visit routes: split the highest-priority clients across workers, then order each run.

Round-robin by rank guarantees every worker's first stop is one of the K most
urgent clients. Greedy nearest-neighbour then keeps each run short. Distances
are straight-line (haversine) × a road factor; good enough to compare runs
across a city, and swappable for a road router later.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from . import config as C


@dataclass(frozen=True)
class Stop:
    client_id: str
    lat: float
    lon: float


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def split_round_robin(stops: list[Stop], workers: int) -> list[list[Stop]]:
    groups: list[list[Stop]] = [[] for _ in range(max(1, workers))]
    for i, s in enumerate(stops):
        groups[i % len(groups)].append(s)
    return groups


def nearest_neighbour(start: tuple[float, float], stops: list[Stop]) -> list[Stop]:
    """Visit the most urgent stop first, then always the closest remaining one."""
    if not stops:
        return []
    order, remaining = [stops[0]], list(stops[1:])
    here = (stops[0].lat, stops[0].lon)
    while remaining:
        nxt = min(remaining, key=lambda s: haversine_km(here, (s.lat, s.lon)))
        remaining.remove(nxt)
        order.append(nxt)
        here = (nxt.lat, nxt.lon)
    return order


def plan_routes(
    ranked: list[Stop], workers: int, office: tuple[float, float], depart: datetime
) -> list[dict]:
    """ranked: clients needing a visit, most urgent first."""
    routes = []
    for w, group in enumerate(split_round_robin(ranked, workers), start=1):
        order = nearest_neighbour(office, group)
        here, clock, total = office, depart, 0.0
        legs = []
        for s in order:
            km = haversine_km(here, (s.lat, s.lon)) * C.ROAD_FACTOR
            total += km
            clock += timedelta(hours=km / C.SPEED_KMH)
            legs.append({"client_id": s.client_id, "eta": clock.strftime("%Y-%m-%dT%H:%M"), "km": round(km, 1)})
            clock += timedelta(minutes=C.VISIT_MINUTES)
            here = (s.lat, s.lon)
        routes.append({
            "worker": w,
            "stops": legs,
            "path": [list(office)] + [[s.lat, s.lon] for s in order],
            "distance_km": round(total, 1),
            "finish": clock.strftime("%Y-%m-%dT%H:%M"),
        })
    return routes
