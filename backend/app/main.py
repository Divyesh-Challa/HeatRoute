"""HeatRoute API. Run: uvicorn backend.app.main:app --reload (from the repo root)."""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from sim.scenarios import DEFAULT_SCENARIO, SCENARIOS

from . import config as C
from .risk import Assessment, LiveState, Visit, apply_live, assess, queue_key
from .routing import Stop, plan_routes
from .schemas import (
    ClientDetail, Counts, HourOut, LiveIn, LiveOut, PromptIn, RankedClient, RankedOut, RouteOut, RouteRequest,
    ScenarioOut, TempPoint, TimelineOut, VisitOut, VisitRequest,
)
from .store import LiveLog, VisitLog, World, default_db_path, world

app = FastAPI(title="HeatRoute", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
visits = VisitLog(default_db_path())
live = LiveLog(default_db_path())

FMT = "%Y-%m-%dT%H:%M"


def get_world(scenario: str) -> World:
    try:
        return world(scenario)
    except KeyError:
        raise HTTPException(404, f"unknown scenario {scenario!r}")


def index_at(w: World, t: str | None) -> int:
    """Weather index for t, clamped to the scenario window. Missing t → window start."""
    if not t:
        return w.first_idx
    try:
        when = datetime.fromisoformat(t).replace(minute=0, second=0, microsecond=0)
    except ValueError:
        raise HTTPException(422, f"bad time {t!r}; expected e.g. 2024-07-18T14:00")
    if when in w.index:
        return min(max(w.index[when], w.first_idx), w.last_idx)
    return w.first_idx if when < w.weather[w.first_idx].t else w.last_idx


def visit_out(w: World, v: Visit | None) -> VisitOut | None:
    if not v:
        return None
    return VisitOut(client_id=v.client_id, name=w.by_id[v.client_id].name, t=v.t.strftime(FMT), outcome=v.outcome)


def phone_list(w: World) -> dict[str, int]:
    """Today's practice: call the oldest clients first."""
    order = sorted(w.roster, key=lambda c: (-c.age, c.id))
    return {c.id: i + 1 for i, c in enumerate(order)}


def heat_warning_at(w: World, idx: int) -> bool:
    return max(h.outdoor_c for h in w.weather[max(0, idx - 23) : idx + 1]) >= C.HEAT_WARNING_OUTDOOR_C


def rank_all(w: World, idx: int, state: LiveState | None = None) -> list[tuple[str, Assessment, str]]:
    log = visits.all(w.scenario.id)
    fidx = min(idx + C.FORECAST_H, w.last_idx)
    state = state or live.state()
    warning = heat_warning_at(w, idx)
    rows = []
    for c in w.roster:
        a = assess(c, w.indoor[c.id], w.weather, idx, log)
        f = assess(c, w.indoor[c.id], w.weather, fidx, log)
        if c.id == C.LIVE_CLIENT:
            a = apply_live(a, state, warning)
        rows.append((c.id, a, f.band))
    rows.sort(key=lambda r: queue_key(r[1]))
    return rows


def to_ranked(w: World, rank: int, cid: str, a: Assessment, fband: str, phone: dict[str, int]) -> RankedClient:
    c = w.by_id[cid]
    return RankedClient(
        rank=rank, client_id=cid, name=c.name, age=c.age, lat=c.lat, lon=c.lon,
        neighbourhood=c.neighbourhood, score=a.score, band=a.band,
        forecast_band=fband if a.status == "needs_visit" else a.band,
        indoor_c=a.indoor_c, hours_above_26=a.hours_above_26, hours_above_31=a.hours_above_31,
        escalated=a.escalated, reasons=a.reasons, status=a.status,
        last_visit=visit_out(w, a.last_visit), phone_list_rank=phone[cid], breakdown=a.breakdown,
        live=a.breakdown.get("live"),
    )


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/scenarios", response_model=list[ScenarioOut])
def scenarios() -> list[ScenarioOut]:
    out = []
    for sc in SCENARIOS.values():
        w = get_world(sc.id)
        out.append(ScenarioOut(
            id=sc.id, label=sc.label, city=sc.city, station=sc.station, start=sc.start, end=sc.end,
            center=sc.center, office=sc.office,
            has_smoke=any(h.smoke for h in w.weather[w.first_idx : w.last_idx + 1]),
        ))
    return out


@app.get("/api/timeline", response_model=TimelineOut)
def timeline(scenario: str = DEFAULT_SCENARIO) -> TimelineOut:
    w = get_world(scenario)
    hours = [HourOut(t=h.t.strftime(FMT), outdoor_c=h.outdoor_c, smoke=h.smoke)
             for h in w.weather[w.first_idx : w.last_idx + 1]]
    return TimelineOut(scenario=scenario, start=hours[0].t, end=hours[-1].t, hours=hours)


@app.get("/api/ranked", response_model=RankedOut)
def ranked(scenario: str = DEFAULT_SCENARIO, t: str | None = None) -> RankedOut:
    w = get_world(scenario)
    idx = index_at(w, t)
    phone = phone_list(w)
    rows = rank_all(w, idx)
    clients = [to_ranked(w, i + 1, cid, a, fb, phone) for i, (cid, a, fb) in enumerate(rows)]
    open_ = [c for c in clients if c.status == "needs_visit"]
    hour = w.weather[idx]
    return RankedOut(
        t=hour.t.strftime(FMT), outdoor_c=hour.outdoor_c, smoke=hour.smoke,
        heat_warning=heat_warning_at(w, idx),
        counts=Counts(
            red=sum(c.band == "red" for c in open_),
            amber=sum(c.band == "amber" for c in open_),
            green=sum(c.band == "green" for c in open_),
            handled=len(clients) - len(open_),
        ),
        clients=clients,
    )


@app.get("/api/clients/{client_id}", response_model=ClientDetail)
def client_detail(client_id: str, scenario: str = DEFAULT_SCENARIO, t: str | None = None,
                  hours: int = Query(24, ge=6, le=96)) -> ClientDetail:
    w = get_world(scenario)
    if client_id not in w.by_id:
        raise HTTPException(404, f"unknown client {client_id!r}")
    idx = index_at(w, t)
    phone = phone_list(w)
    rows = rank_all(w, idx)
    rank, (cid, a, fb) = next((i + 1, r) for i, r in enumerate(rows) if r[0] == client_id)
    lo, hi = max(0, idx - hours + 1), min(len(w.weather) - 1, idx + C.FORECAST_H)
    series = w.indoor[client_id]
    temps = [
        TempPoint(t=w.weather[i].t.strftime(FMT), indoor_c=round(series[i], 1),
                  outdoor_c=w.weather[i].outdoor_c, smoke=w.weather[i].smoke, future=i > idx)
        for i in range(lo, hi + 1)
    ]
    return ClientDetail(profile=w.by_id[client_id].to_dict(), assessment=to_ranked(w, rank, cid, a, fb, phone), temps=temps)


@app.post("/api/routes", response_model=list[RouteOut])
def routes(req: RouteRequest) -> list[dict]:
    w = get_world(req.scenario)
    idx = index_at(w, req.t)
    rows = [r for r in rank_all(w, idx) if r[1].status == "needs_visit" and r[1].band in ("red", "amber")]
    rows = rows[: req.top_n]
    stops = [Stop(cid, w.by_id[cid].lat, w.by_id[cid].lon) for cid, _, _ in rows]
    band = {cid: a.band for cid, a, _ in rows}
    plans = plan_routes(stops, req.workers, w.scenario.office, w.weather[idx].t)
    for p in plans:
        for s in p["stops"]:
            s["name"] = w.by_id[s["client_id"]].name
            s["band"] = band[s["client_id"]]
    return plans


@app.post("/api/visits")
def log_visit(req: VisitRequest) -> dict:
    w = get_world(req.scenario)
    if req.client_id not in w.by_id:
        raise HTTPException(404, f"unknown client {req.client_id!r}")
    visits.add(req.scenario, req.client_id, w.weather[index_at(w, req.t)].t, req.outcome)
    if req.client_id == C.LIVE_CLIENT:
        live.add("coordinator", "clear")  # a visit answers any Help press or check-in request
    return {"ok": True}


@app.get("/api/visits", response_model=list[VisitOut])
def list_visits(scenario: str = DEFAULT_SCENARIO) -> list[VisitOut]:
    w = get_world(scenario)
    return [visit_out(w, v) for v in reversed(visits.all(scenario))]


@app.post("/api/reset")
def reset(scenario: str | None = None) -> dict:
    visits.reset(scenario)
    live.reset()
    return {"ok": True}


# ---------- Live sensors (optional hardware) ----------

def device_key() -> str:
    return os.environ.get("HEATROUTE_DEVICE_KEY", "")


@app.post("/api/live")
def live_in(req: LiveIn, x_device_key: str | None = Header(None)) -> dict:
    """From the ESP32, the USB bridge, or the on-screen simulator."""
    if device_key() and x_device_key != device_key():
        raise HTTPException(401, "missing or wrong X-Device-Key")
    if req.hr_bpm is not None:
        live.add(req.device_id, "hr", req.hr_bpm)
    if req.event:
        live.add(req.device_id, req.event)
    return {"ok": True}


@app.get("/api/live", response_model=LiveOut)
def live_out() -> LiveOut:
    st = live.state()
    hr_elevated = st.hr_fresh() and (st.hr_bpm or 0) >= C.HR_ELEVATED_BPM
    ok_recent = st.checkin == "ok" and (st.checkin_age_s or 0) <= C.CHECKIN_OK_S
    name = world(DEFAULT_SCENARIO).by_id[C.LIVE_CLIENT].name
    return LiveOut(
        rev=f"{live.rev()}-{int(st.online)}{int(st.hr_fresh())}{int(hr_elevated)}{int(ok_recent)}{int(st.prompt_missed)}",
        key_required=bool(device_key()),
        client_id=C.LIVE_CLIENT,
        client_name=name,
        online=st.online,
        hr_bpm=round(st.hr_bpm) if st.hr_fresh() else None,
        hr_age_s=st.hr_age_s,
        hr_elevated=hr_elevated,
        checkin=st.checkin,  # type: ignore[arg-type]
        checkin_age_s=st.checkin_age_s,
        prompt_pending=st.prompt_pending,
        prompt_seconds_left=st.prompt_seconds_left,
        prompt_missed=st.prompt_missed,
        devices=live.devices(),
        hr_history=live.hr_history(),
    )


@app.post("/api/live/prompt")
def live_prompt(req: PromptIn) -> dict:
    """Coordinator asks the client to press a button; unanswered after PROMPT_TIMEOUT_S it counts as missed."""
    if req.client_id != C.LIVE_CLIENT:
        raise HTTPException(400, "no live device is bound to this client")
    live.request_checkin(req.client_id)
    return {"ok": True, "timeout_s": C.PROMPT_TIMEOUT_S}


@app.get("/api/live/{device_id}/prompt")
def live_prompt_poll(device_id: str) -> dict:
    """The ESP32 polls this to know when to blink its LED."""
    st = live.state()
    return {"pending": st.prompt_pending, "missed": st.prompt_missed}


# Production: serve the built frontend from the same origin.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        f = DIST / path
        return FileResponse(f if path and f.is_file() else DIST / "index.html")
