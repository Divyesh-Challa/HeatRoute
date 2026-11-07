// Mirrors contract/api.md. Keep in sync with backend/app/schemas.py.
export type Band = "red" | "amber" | "green" | "unknown";
export type Status = "needs_visit" | "visited_ok" | "relocated" | "escalated";
export type Outcome = "ok" | "moved_to_cooling" | "called_911";

export interface Scenario {
  id: string;
  label: string;
  city: string;
  station: string;
  start: string;
  end: string;
  center: [number, number];
  office: [number, number];
  has_smoke: boolean;
}

export interface Hour {
  t: string;
  outdoor_c: number;
  smoke: boolean;
}

export interface Timeline {
  scenario: string;
  start: string;
  end: string;
  step_hours: number;
  hours: Hour[];
}

export interface VisitRecord {
  client_id: string;
  name: string;
  t: string;
  outcome: Outcome;
}

export interface Factor {
  label: string;
  points: number;
}

export interface Breakdown {
  exposure: number;
  exposure_norm: number;
  vulnerability: number;
  smoke_bonus: number;
  hot_night: boolean;
  factors: Factor[];
}

export interface RankedClient {
  rank: number;
  client_id: string;
  name: string;
  age: number;
  lat: number;
  lon: number;
  neighbourhood: string;
  score: number;
  band: Band;
  forecast_band: Band;
  indoor_c: number;
  hours_above_26: number;
  hours_above_31: number;
  escalated: boolean;
  reasons: string[];
  status: Status;
  last_visit: VisitRecord | null;
  phone_list_rank: number;
  breakdown: Breakdown;
}

export interface Ranked {
  t: string;
  outdoor_c: number;
  smoke: boolean;
  heat_warning: boolean;
  counts: { red: number; amber: number; green: number; handled: number };
  clients: RankedClient[];
}

export interface Profile {
  id: string;
  name: string;
  age: number;
  neighbourhood: string;
  lives_alone: boolean;
  conditions: string[];
  mobility_limited: boolean;
  cognitive_impairment: boolean;
  has_ac: boolean;
  floor: number;
  top_floor: boolean;
  orientation: "N" | "E" | "S" | "W";
  insulation: "poor" | "average" | "good";
}

export interface TempPoint {
  t: string;
  indoor_c: number;
  outdoor_c: number;
  smoke: boolean;
  future: boolean;
}

export interface ClientDetail {
  profile: Profile;
  assessment: RankedClient;
  temps: TempPoint[];
}

export interface RouteStop {
  client_id: string;
  name: string;
  band: Band;
  eta: string;
  km: number;
}

export interface Route {
  worker: number;
  stops: RouteStop[];
  path: [number, number][];
  distance_km: number;
  finish: string;
}
