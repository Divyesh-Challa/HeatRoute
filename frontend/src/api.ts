import type { ClientDetail, Outcome, Ranked, Route, Scenario, Timeline, VisitRecord } from "./types";
import scenariosMock from "./mocks/scenarios.json";
import timelineMock from "./mocks/timeline.json";
import rankedMock from "./mocks/ranked.json";
import clientMock from "./mocks/client_c01.json";
import routesMock from "./mocks/routes.json";
import visitsMock from "./mocks/visits.json";

// One flag: VITE_USE_MOCKS=1 runs the UI on contract fixtures with no backend.
const MOCK = import.meta.env.VITE_USE_MOCKS === "1";
const BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const q = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)]));
const mock = <T,>(data: unknown) => Promise.resolve(data as T);

export const api = {
  scenarios: () => (MOCK ? mock<Scenario[]>(scenariosMock) : call<Scenario[]>("/scenarios")),
  timeline: (scenario: string) =>
    MOCK ? mock<Timeline>(timelineMock) : call<Timeline>(`/timeline?${q({ scenario })}`),
  ranked: (scenario: string, t: string) =>
    MOCK ? mock<Ranked>(rankedMock) : call<Ranked>(`/ranked?${q({ scenario, t })}`),
  client: (scenario: string, id: string, t: string) =>
    MOCK ? mock<ClientDetail>(clientMock) : call<ClientDetail>(`/clients/${id}?${q({ scenario, t })}`),
  routes: (scenario: string, t: string, workers: number, top_n: number) =>
    MOCK
      ? mock<Route[]>(routesMock)
      : call<Route[]>("/routes", { method: "POST", body: JSON.stringify({ scenario, t, workers, top_n }) }),
  logVisit: (scenario: string, client_id: string, t: string, outcome: Outcome) =>
    MOCK
      ? mock<{ ok: boolean }>({ ok: true })
      : call<{ ok: boolean }>("/visits", { method: "POST", body: JSON.stringify({ scenario, client_id, t, outcome }) }),
  visits: (scenario: string) =>
    MOCK ? mock<VisitRecord[]>(visitsMock) : call<VisitRecord[]>(`/visits?${q({ scenario })}`),
  reset: (scenario: string) =>
    MOCK ? mock<{ ok: boolean }>({ ok: true }) : call<{ ok: boolean }>(`/reset?${q({ scenario })}`, { method: "POST" }),
};
