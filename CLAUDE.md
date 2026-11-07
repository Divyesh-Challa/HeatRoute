# HeatRoute — project context (all agents read this first)

Student team project for natHacks 2026, Standard Division, Healthcare & Accessibility theme. This file is the single source of truth. Every agent reads it before working. If something here is wrong, the orchestrator fixes this file first, then tells the affected agents.

## Hard constraints

- **Code freeze Sunday Nov 9, 2026, 7:00 AM MDT.** Public GitHub repo + README due 11:00 AM MDT.
- **All code is written during the competition.** No code copied from older projects. Open-source libraries are fine.
- **Synthetic people only.** Client names, ages, conditions, and addresses are invented. Never use real patient data.
- **No hardware required.** Everything runs on simulated indoor data driven by real outdoor weather. A physical sensor is an optional stretch goal only.
- **No secrets in the repo.** `.env` is git-ignored; ship `.env.example`.
- **Demo reliability beats feature count.** A feature that works on stage beats three half-built ones.

## What HeatRoute does

A dispatch tool for a home care coordinator during a heat wave. It combines **how hot each client's home has been** with **how vulnerable each client is**, and answers three questions on one screen:

1. **Who is in danger right now?** Every client ranked by urgency.
2. **Why?** A plain-language reason per client, e.g. `32.4°C for 6 h · lives alone · no AC · heart disease`.
3. **What should workers do next?** A visit route per available worker on a map, with ETAs. Logging a visit re-ranks the list.

Plus one look ahead: **who will be in danger in 6 hours** (forecast band), so coordinators dispatch before a home turns red, not after.

### Framing: Alberta first, Vancouver as proof it generalizes

- **Primary scenario — Edmonton, July 2024: heat wave + wildfire smoke.** Edmonton hit 34–36°C on July 10 and July 17–22, 2024, with nights staying near 20°C. Environment Canada's Edmonton International station logged hourly **"Smoke"** observations July 20–25, the same week the Jasper wildfire started (July 22, 2024). Smoke is the compound hazard: public health advice during smoke is to keep windows closed, which removes the only night cooling a no-AC home has, and smoke itself harms clients with lung and heart disease.
- **Secondary scenarios (same code, switchable in the UI):** Edmonton, June 2021 heat dome (37°C on June 30, overnight lows 20–24°C) and Metro Vancouver, June 2021 heat dome (Pitt Meadows, 41°C).
- **Why it matters:** the 2021 Western Canada heat dome is the deadliest weather event in Canadian history. BC's coroner review found 619 heat deaths: 98% died indoors, 67% were 70+, 56% lived alone. It is the best evidence we have of *who* dies in Canadian heat, and the same heat dome broke records across Alberta. Alberta now faces heat and wildfire smoke together most summers. Agencies still triage by phone list.
- Never overclaim: say "the same week as the Jasper wildfire", not "smoke from Jasper" (Edmonton's July 20–21 smoke predates the Jasper ignition and came from other fires).

**Differentiation:** check-in tools (MyDailyCheck) know who's vulnerable but not how hot their home is. Sensor platforms (HomeLINK/Aico) know how hot homes are but not who lives there. HeatRoute combines both, models the smoke-closed-windows effect, and turns it into the decision a coordinator actually makes: who to visit first, in what order.

## Demo we're building toward (5 minutes)

1. Scenario "Edmonton · July 2024". Slider at July 15: everyone green.
2. Introduce one client, "Margaret, 84, top-floor apartment, no AC, lives alone."
3. Drag the slider through July 17–19. Indoor temperatures climb; Margaret rises to #1 with her reason. Gordon, 91, ground floor with AC, stays green despite being older. Show "an oldest-first phone list would have called Margaret #N".
4. Continue to July 20–22: smoke banner appears; no-AC homes stop cooling at night; clients with COPD jump with reason "smoke + COPD". Forecast badges show who turns red in the next 6 h.
5. Set 3 workers → map shows each worker's route with ETAs.
6. Log Margaret's visit as "moved to cooling centre" → list re-ranks.
7. (Judge question "does this only work for Edmonton?") Switch scenario to Vancouver 2021 → same tool, same people, different city.

Every task should serve this sequence. Seed data must make it happen.

## Architecture

```
data/weather_<scenario>.csv   (hourly outdoor temp + smoke flag, real Environment Canada data)
        │
sim/  thermal model → indoor temp per home per hour (precomputed at startup, per scenario)
      roster generator → 60 synthetic clients (seeded, deterministic), placed in the scenario's city
        │
backend/ (FastAPI, SQLite for visit log; also serves the built frontend in production)
      risk engine → score + band + reasons + 6 h forecast per client at time t
      routing     → visit order + ETAs per worker
      REST API (below)
        │
frontend/ (Vite + React + TypeScript, Leaflet, Recharts)
      scenario picker · time slider · ranked list · map with routes · client detail · visit logging
```

Deployment: one Docker image (Node builds the frontend, Python serves API + static files) on Render, free web service. `render.yaml` at repo root.

### Repo layout and ownership

```
heatroute/
  CLAUDE.md, README.md, .env.example, Dockerfile, render.yaml, Makefile
  data/                     # owned by: sim-agent
  sim/                      # owned by: sim-agent
    scenarios.py            # scenario registry (city, station, window, map centre, office)
    thermal.py              # indoor temperature model
    roster.py               # synthetic clients
    weather.py              # load + clean hourly CSV; synthetic fallback
    tests/
  backend/                  # owned by: backend-agent
    app/main.py
    app/config.py           # all thresholds and weights
    app/risk.py             # pure functions, unit-tested
    app/routing.py          # pure functions, unit-tested
    app/store.py            # loads sim output, visit log (SQLite)
    app/schemas.py          # Pydantic models matching the contract below
    tests/
  frontend/                 # owned by: frontend-agent
    src/api.ts, src/types.ts, src/mocks/, src/components/*, src/App.tsx
  contract/                 # owned by: orchestrator
    api.md, fixtures/*.json
  docs/                     # owned by: orchestrator
    summary.md              # written summary (5 judging points)
    pitch.md                # 5-minute script + judge Q&A
```

**Agents only edit files in the folders they own.** Cross-folder changes go through the orchestrator.

## Interface contract (change only via the orchestrator)

Times are ISO 8601 hour strings in local time, e.g. `2024-07-18T18:00`. Every endpoint takes `scenario` (query param or body field); default `edmonton_2024`.

`sim` exposes Python functions used by the backend:

```python
SCENARIOS: dict[str, Scenario]                                   # id → metadata
load_weather(scenario_id) -> list[WeatherHour]                   # WeatherHour(t, outdoor_c, smoke: bool)
generate_roster(scenario_id, seed: int = 42, n: int = 60) -> list[Client]
simulate_indoor(roster, weather) -> dict[client_id, list[float]] # aligned with weather hours
```

`Client` fields: `id, name, age, lat, lon, lives_alone, conditions: list[str], mobility_limited, cognitive_impairment, has_ac, floor, top_floor, orientation ("N"|"E"|"S"|"W"), insulation ("poor"|"average"|"good"), neighbourhood`.

REST (backend, all under `/api`):

| Method + path | Returns |
| --- | --- |
| `GET /api/scenarios` | `[{id, label, city, station, start, end, center: [lat, lon], office: [lat, lon], has_smoke}]` |
| `GET /api/timeline?scenario=` | `{scenario, start, end, step_hours: 1, hours: [{t, outdoor_c, smoke}]}` |
| `GET /api/ranked?scenario=&t=` | `{t, outdoor_c, smoke, heat_warning, counts: {red, amber, green}, clients: [ranked client]}` sorted by score desc |
| `GET /api/clients/{id}?scenario=&t=` | client profile + `breakdown` + `temps: [{t, indoor_c, outdoor_c, smoke}]` (24 h back, 6 h ahead) |
| `POST /api/routes` | body `{scenario, t, workers: int, top_n: int}` → `[{worker, stops: [{client_id, name, band, eta}], path: [[lat, lon], ...], distance_km}]` |
| `POST /api/visits` | body `{scenario, client_id, t, outcome: "ok" \| "moved_to_cooling" \| "called_911"}` → `{ok: true}` |
| `GET /api/visits?scenario=` | `[{client_id, name, t, outcome}]` newest first |
| `POST /api/reset?scenario=` | clears the visit log (for re-running the demo) |

Ranked client shape:

```json
{
  "rank": 1,
  "client_id": "c01",
  "name": "Margaret T.",
  "age": 84,
  "lat": 53.5444, "lon": -113.4909,
  "neighbourhood": "Downtown",
  "score": 87.4,
  "band": "red",
  "forecast_band": "red",
  "indoor_c": 32.4,
  "hours_above_26": 14,
  "hours_above_31": 6,
  "escalated": true,
  "reasons": ["32.4°C for 6 h", "lives alone", "no AC", "heart disease"],
  "status": "needs_visit",
  "last_visit": null,
  "phone_list_rank": 23,
  "breakdown": {"exposure": 41.2, "exposure_norm": 0.69, "vulnerability": 7, "smoke_bonus": 0}
}
```

`band`: `red` | `amber` | `green` | `unknown`. `status`: `needs_visit` | `visited_ok` | `relocated` | `escalated`. `phone_list_rank` = position in an oldest-first list (what agencies do today).

## Component specs

### Simulator (`sim/`)
- **Weather:** `data/weather_<scenario>.csv` with `timestamp,outdoor_c,smoke`, built from Environment Canada hourly bulk CSVs (script in `data/fetch_weather.py`, outputs committed). Edmonton temperatures from Edmonton Blatchford (urban, station 27214); smoke flag from Edmonton Intl A (station 50149) "Weather" column. Vancouver from Pitt Meadows CS (6830); YVR is ocean-cooled and undersells the event. If a file is missing, `weather.py` generates a synthetic heat-wave curve and logs a warning.
- **Thermal model (first-order, hourly Euler step):**
  `T_in[t+1] = T_in[t] + (T_out[t] − T_in[t]) / tau + solar_gain(t) + internal_gain − ac_cooling`
  - `tau` (hours) by insulation: poor 4, average 7, good 12. When T_out < T_in (night cooling through windows), use `tau × vent_factor`; **smoke hours close windows**, so vent_factor is large (night flushing mostly lost).
  - `solar_gain` peaks mid-afternoon, scaled up for top floor and S/W orientation, zero at night.
  - `has_ac`: indoor capped near 24–25°C.
  - Start at 22°C with a 48 h spin-up. Clamp to plausible ranges. Document parameters in the README.
- **Roster:** 60 clients, deterministic with a seed; the same people in every scenario, placed around the scenario's city centre. Must include Margaret (84, top floor, S-facing, poor insulation, no AC, lives alone, heart disease) and Gordon (91, ground floor, N-facing, good insulation, has AC). Include several COPD clients without AC. Mix ~40% no AC, ~45% living alone.

### Risk engine (`backend/app/risk.py`) — pure functions, unit-tested
- **Exposure, last 24 h, in degree-hours:** `E = Σ [max(0, T−26) + 2·max(0, T−31)]` per hour, plus a bonus if the home stayed above 26°C overnight (00:00–06:00).
- **Vulnerability:** age 70+ +2 (85+ +3), lives alone +2, each condition +1 (max 3), mobility limited +1, cognitive impairment +1, no AC +2. **Smoke:** respiratory/cardiac condition during smoke in the last 24 h +2. Weights in `config.py`.
- **Score:** `score = E_normalized × (1 + vulnerability / 5)`, scaled 0–100.
- **Escalation (force red, top of list):** indoor ≥ 31°C for 3+ consecutive hours and lives alone.
- **Bands:** red ≥ 60 or escalated, amber ≥ 25, green below.
- **Forecast:** the same score computed at t+6 h (a real deployment would feed Environment Canada's hourly forecast into the same thermal model).
- **Visit outcomes:** `ok` → deprioritized for 4 h; `moved_to_cooling` → exposure stops accruing until 08:00 next day; `called_911` → removed from the queue, status `escalated`.
- **Reasons:** up to 4 short strings, most important first. Every ranking must be explainable from its reasons.

### Routing (`backend/app/routing.py`)
- Input: top N clients (default 12) needing a visit, K workers, office start point (per scenario).
- Round-robin by rank across workers, then greedy nearest-neighbour order per worker. Haversine distance × 1.3 road factor, 30 km/h, 20 min per visit → ETAs. Say so in the README. OR-Tools is a stretch goal only.

### Frontend (`frontend/`)
- Layout: header with scenario picker + time slider; ranked list left; map right; client detail drawer on click.
- Time slider: hourly steps, play/pause, date + outdoor temperature, mini outdoor temperature strip with smoke hours shaded.
- Ranked list: band shown by colour **and** text label (colour-blind safe), name, age, indoor temp, reasons, forecast badge, status. Large, readable, keyboard navigable.
- Summary bar: red/amber/green counts, heat warning banner (outdoor ≥ 29°C), smoke banner.
- Map: Leaflet + OSM tiles; pins coloured by band; route polylines per worker; worker count input; route list with ETAs, printable.
- Client detail: indoor vs outdoor chart (Recharts) with 26°C/31°C lines and smoke shading; score breakdown; visit buttons; "phone list would rank #N".
- Build against `src/mocks/` first; switch to the real API with one flag.

## Build order and priorities

1. Contract fixtures → sim → backend risk + core endpoints → frontend slider + list.
2. Routing + map, visits + re-rank.
3. Smoke + forecast + phone-list comparison.
4. Client detail chart, banners, polish, README, docs, deploy.

**Cut order if behind:** OR-Tools → printable routes → client detail chart → play button → warning banner. Never cut: slider, ranked list with reasons, visits re-ranking, smoke effect.

## How judges score (for tradeoffs)

Rubric: six criteria × 10 (technical execution, functionality & usability, creativity, impact, feasibility & continuation, pitch & demo) + written summary 5 + Standard Division interdisciplinary bonus 3 = 68. So:
- **Technical:** README explains the thermal model, risk formula, thresholds (with sources), routing, and *why* each choice; tests pass.
- **Usability:** README section "Designed for coordinators" (one screen, reasons on every row, colour + text labels, large type, keyboard). The demo must work every time; `POST /reset` exists.
- **Creativity:** heat × vulnerability × smoke compound model; forecast; phone-list comparison.
- **Impact:** sourced statistics; Alberta setting.
- **Feasibility:** README section "Path to a pilot": data sources (ECCC forecast API, low-cost sensors), Alberta home care partner, clinical review of weights, privacy (Alberta HIA), validation plan, costs.
- **Pitch:** `docs/pitch.md` with timed script and judge Q&A.
- **Written summary:** `docs/summary.md`: problem, approach, decisions, results, process.
- **Bonus:** README "Team" section listing each member's field.

## Conventions

- Python 3.11+, FastAPI, Pydantic, pytest, type hints. Frontend: Vite + React + TypeScript, Leaflet (react-leaflet), Recharts.
- Config (thresholds, weights, office location, worker defaults) in one place per package.
- Small commits with clear messages, one area per commit.
- README sections: concept, live demo link, demo steps, how to run, technical decisions, designed for coordinators, path to a pilot, data sources, team, credits.
