"""Pydantic models matching contract/api.md."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Band = Literal["red", "amber", "green", "unknown"]
Status = Literal["needs_visit", "visited_ok", "relocated", "escalated", "checked_in"]
Outcome = Literal["ok", "moved_to_cooling", "called_911"]


class ScenarioOut(BaseModel):
    id: str
    label: str
    city: str
    station: str
    start: str
    end: str
    center: tuple[float, float]
    office: tuple[float, float]
    has_smoke: bool


class HourOut(BaseModel):
    t: str
    outdoor_c: float
    smoke: bool


class TimelineOut(BaseModel):
    scenario: str
    start: str
    end: str
    step_hours: int = 1
    hours: list[HourOut]


class VisitOut(BaseModel):
    client_id: str
    name: str = ""
    t: str
    outcome: Outcome


class RankedClient(BaseModel):
    rank: int
    client_id: str
    name: str
    age: int
    lat: float
    lon: float
    neighbourhood: str
    score: float
    band: Band
    forecast_band: Band
    indoor_c: float
    hours_above_26: int
    hours_above_31: int
    escalated: bool
    reasons: list[str]
    status: Status
    last_visit: VisitOut | None
    phone_list_rank: int
    breakdown: dict
    live: dict | None = None  # only on the client a live device is bound to


class Counts(BaseModel):
    red: int
    amber: int
    green: int
    handled: int


class RankedOut(BaseModel):
    t: str
    outdoor_c: float
    smoke: bool
    heat_warning: bool
    counts: Counts
    clients: list[RankedClient]


class TempPoint(BaseModel):
    t: str
    indoor_c: float
    outdoor_c: float
    smoke: bool
    future: bool


class ClientDetail(BaseModel):
    profile: dict
    assessment: RankedClient
    temps: list[TempPoint]


class RouteRequest(BaseModel):
    scenario: str = "edmonton_2024"
    t: str
    workers: int = Field(3, ge=1, le=8)
    top_n: int = Field(12, ge=1, le=40)


class RouteStop(BaseModel):
    client_id: str
    name: str
    band: Band
    eta: str
    km: float


class RouteOut(BaseModel):
    worker: int
    stops: list[RouteStop]
    path: list[list[float]]
    distance_km: float
    finish: str


class VisitRequest(BaseModel):
    scenario: str = "edmonton_2024"
    client_id: str
    t: str
    outcome: Outcome


class LiveIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=40)
    hr_bpm: float | None = Field(None, ge=30, le=230)
    event: Literal["ok", "help", "ping"] | None = None


class LiveDevice(BaseModel):
    device_id: str
    last_seen_s: float
    online: bool


class LiveOut(BaseModel):
    rev: str  # changes whenever anything the UI shows changes
    key_required: bool
    client_id: str
    client_name: str
    online: bool
    hr_bpm: float | None
    hr_age_s: float | None
    hr_elevated: bool
    checkin: Literal["ok", "help"] | None
    checkin_age_s: float | None
    prompt_pending: bool
    prompt_seconds_left: float | None
    prompt_missed: bool
    devices: list[LiveDevice]
    hr_history: list[dict]


class PromptIn(BaseModel):
    client_id: str
