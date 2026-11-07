# HeatRoute API contract

Source of truth: the "Interface contract" section of `CLAUDE.md`. Pydantic models in
`backend/app/schemas.py` enforce it; `frontend/src/types.ts` mirrors it.

Fixtures in `fixtures/` are real responses captured from the backend for the demo moment
`scenario=edmonton_2024, t=2024-07-17T18:00` (Margaret ranked #1). The frontend runs on them
with `VITE_USE_MOCKS=1`.

| Fixture | Request |
| --- | --- |
| `scenarios.json` | `GET /api/scenarios` |
| `timeline.json` | `GET /api/timeline?scenario=edmonton_2024` |
| `ranked.json` | `GET /api/ranked?scenario=edmonton_2024&t=2024-07-17T18:00` |
| `client_c01.json` | `GET /api/clients/c01?scenario=edmonton_2024&t=2024-07-17T18:00` |
| `routes.json` | `POST /api/routes {t: "2024-07-17T18:00", workers: 3, top_n: 12}` |
| `visits.json` | `GET /api/visits` after logging Margaret as `moved_to_cooling` |

Times are local wall-clock hours, `YYYY-MM-DDTHH:MM`, no timezone. Interactive docs at `/docs`.
