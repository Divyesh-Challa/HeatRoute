import type { Band, Outcome, Status } from "./types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Times are local wall-clock strings ("2024-07-18T18:00"); parse them without timezone shifts.
export function parts(t: string) {
  const [d, hm] = t.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return { y, m, day, dow, hm };
}

export const fmtDay = (t: string) => {
  const p = parts(t);
  return `${DAYS[p.dow]} ${MONTHS[p.m - 1]} ${p.day}`;
};
export const fmtTime = (t: string) => parts(t).hm;
export const fmtWhen = (t: string) => `${fmtDay(t)}, ${fmtTime(t)}`;
export const fmtC = (c: number) => `${c.toFixed(1)}°C`;

export const BAND_LABEL: Record<Band, string> = {
  red: "Urgent",
  amber: "Watch",
  green: "OK",
  unknown: "Handled",
};

export const STATUS_LABEL: Record<Status, string> = {
  needs_visit: "Needs visit",
  visited_ok: "Checked, OK",
  relocated: "At cooling centre",
  escalated: "911 called",
  checked_in: "Checked in: OK",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  ok: "Checked, OK",
  moved_to_cooling: "Moved to cooling centre",
  called_911: "Called 911",
};

// One hue plus neutrals: risk colours stay reserved for risk.
export const WORKER_COLOURS = ["#1d5fbf", "#141414", "#8a8a8a", "#5b8bd6", "#4a4a4a"];
export const workerColour = (w: number) => WORKER_COLOURS[(w - 1) % WORKER_COLOURS.length];
