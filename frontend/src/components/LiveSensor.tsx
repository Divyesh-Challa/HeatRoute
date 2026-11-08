import { Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { LiveStatus } from "../types";

const HR_ELEVATED = 100;

export interface SimControls {
  hr: number;
  setHr: (n: number) => void;
  streaming: boolean;
  setStreaming: (on: boolean) => void;
  press: (event: "ok" | "help") => void;
}

interface Props {
  live: LiveStatus | null;
  onRequestCheckin: () => void;
  sim: SimControls;
}

/** Live heart rate and check-in state for the client wearing the device, plus a stand-in simulator. */
export default function LiveSensor({ live, onRequestCheckin, sim }: Props) {
  const hardware = live?.devices.some((d) => d.online && d.device_id !== "sim") ?? false;

  if (!live) return null;
  const history = live.hr_history.map((p) => ({ x: -p.age_s, bpm: p.bpm }));

  let checkinText = "No check-in requested.";
  if (live.prompt_pending) checkinText = `Waiting for a button press · ${Math.ceil(live.prompt_seconds_left ?? 0)} s left`;
  else if (live.prompt_missed) checkinText = "Missed check-in: no button press after the request.";
  else if (live.checkin === "help") checkinText = "Pressed Help.";
  else if (live.checkin === "ok") checkinText = `Pressed I'm OK ${Math.round((live.checkin_age_s ?? 0) / 60)} min ago.`;

  return (
    <section aria-labelledby="live-title">
      <h3 id="live-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Live sensor
        <span className={`pill ${live.online ? "green" : "neutral"}`}>
          <span className={`mark${live.online ? " live-dot" : ""}`} aria-hidden="true" />
          {live.online ? (hardware ? "Device online" : "Simulator") : "Offline"}
        </span>
      </h3>

      <div className="live-grid">
        <div>
          <div className="live-bpm num" aria-live="polite">
            {live.hr_bpm ?? "–"}
            <span className="unit"> bpm</span>
          </div>
          {live.hr_elevated ? (
            <span className="pill red"><span className="mark" aria-hidden="true" />Elevated heart rate</span>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>{live.hr_bpm ? "Resting range" : "No heart-rate reading"}</span>
          )}
        </div>
        <div style={{ height: 84 }} aria-hidden="true">
          {history.length > 1 && (
            <ResponsiveContainer>
              <LineChart data={history} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="x" type="number" domain={[-90, 0]} tick={{ fontSize: 11, fill: "#5e5e5e" }} tickFormatter={(v) => (v === 0 ? "now" : `${v}s`)} ticks={[-90, -60, -30, 0]} tickLine={false} axisLine={{ stroke: "#d4d4d4" }} />
                <YAxis domain={[40, 160]} ticks={[60, 100, 140]} tick={{ fontSize: 11, fill: "#5e5e5e" }} tickLine={false} axisLine={false} width={30} />
                <ReferenceLine y={HR_ELEVATED} stroke="#c4242a" strokeDasharray="4 3" />
                <Line dataKey="bpm" stroke="#1d5fbf" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <p className={live.prompt_missed || live.checkin === "help" ? "live-alert" : "muted"} style={{ fontSize: 14, margin: "10px 0" }}>
        {checkinText}
      </p>
      <button className="btn" onClick={onRequestCheckin} disabled={live.prompt_pending}>
        {live.prompt_pending ? "Check-in requested" : "Request check-in"}
      </button>

      {!live.key_required && (
        <details className="sim" open={!hardware}>
          <summary>{hardware ? "Simulator (a device is connected)" : "Simulate the device (no hardware needed)"}</summary>
          <div className="sim-body">
            <label htmlFor="sim-hr" className="sim-hr">
              Heart rate <strong className="num">{sim.hr} bpm</strong>
            </label>
            <input id="sim-hr" type="range" min={55} max={140} step={1} value={sim.hr} onChange={(e) => sim.setHr(Number(e.target.value))} />
            <div className="visit-buttons">
              <button className="btn toggle" aria-pressed={sim.streaming} onClick={() => sim.setStreaming(!sim.streaming)}>
                {sim.streaming ? "Stop sending" : "Send heart rate"}
              </button>
              <button className="btn" onClick={() => sim.press("ok")}>Press I'm OK</button>
              <button className="btn danger" onClick={() => sim.press("help")}>Press Help</button>
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
