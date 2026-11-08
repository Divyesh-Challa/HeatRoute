import { useEffect, useRef } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ClientDetail as Detail, LiveStatus, Outcome } from "../types";
import BandPill from "./BandPill";
import VisitButtons from "./VisitButtons";
import LiveSensor, { type SimControls } from "./LiveSensor";
import { STATUS_LABEL, fmtC, fmtTime, fmtWhen, OUTCOME_LABEL } from "../format";

interface Props {
  detail: Detail | null;
  now: string;
  total: number;
  onClose: () => void;
  onVisit: (o: Outcome) => void;
  busy: boolean;
  live: LiveStatus | null;
  onRequestCheckin: () => void;
  sim: SimControls;
}

const ORIENT = { N: "north", E: "east", S: "south", W: "west" } as const;
const ordinal = (n: number) => (n === 0 ? "ground" : `${n}${["th", "st", "nd", "rd"][n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10]}`);

export default function ClientDetail({ detail, now, total, onClose, onVisit, busy, live, onRequestCheckin, sim }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, detail?.profile.id]);

  if (!detail) {
    return (
      <aside className="drawer" aria-label="Client detail" aria-busy="true">
        <div className="drawer-head">
          <h2>Loading…</h2>
          <button ref={closeRef} className="btn" onClick={onClose}>Close</button>
        </div>
      </aside>
    );
  }

  const { profile: p, assessment: a, temps } = detail;
  const data = temps.map((x) => ({
    ...x,
    past: x.future ? null : x.indoor_c,
    ahead: x.future || x.t === now ? x.indoor_c : null,
  }));
  const smokeSpans: [string, string][] = [];
  data.forEach((d, i) => {
    if (!d.smoke) return;
    const last = smokeSpans[smokeSpans.length - 1];
    if (last && data[i - 1]?.smoke) last[1] = d.t;
    else smokeSpans.push([d.t, d.t]);
  });
  const home = [
    p.floor === 0 ? "Ground floor" : `${ordinal(p.floor)} floor`,
    p.top_floor ? "top floor" : null,
    `${ORIENT[p.orientation]}-facing`,
    `${p.insulation} insulation`,
    p.has_ac ? "has AC" : "no AC",
  ].filter(Boolean).join(", ");
  const b = a.breakdown;

  return (
    <aside className="drawer" aria-labelledby="detail-title">
      <div className="drawer-head">
        <div>
          <h2 id="detail-title">{p.name}, {p.age}</h2>
          <div className="sub">
            {p.neighbourhood} · {a.status === "needs_visit" ? <>#{a.rank} of {total} in the queue</> : STATUS_LABEL[a.status]}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {a.status === "needs_visit" ? <BandPill band={a.band} /> : <span className="pill neutral">{STATUS_LABEL[a.status]}</span>}
          <button ref={closeRef} className="btn" onClick={onClose} aria-label="Close client detail">Close</button>
        </div>
      </div>
      <div className="drawer-body">
        <section aria-labelledby="why-title">
          <h3 id="why-title">Why {a.status === "needs_visit" ? `#${a.rank}` : "this status"}</h3>
          <ul className="why">
            {a.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="muted" style={{ fontSize: 14, margin: "10px 0 0" }}>
            An oldest-first phone list would reach {p.name.split(" ")[0]} at call <span className="num">#{a.phone_list_rank}</span> of {total}.
          </p>
        </section>

        <section aria-labelledby="log-title">
          <h3 id="log-title">Log a visit at {fmtWhen(now)}</h3>
          <VisitButtons onVisit={onVisit} busy={busy} />
          {a.last_visit && (
            <p className="muted" style={{ fontSize: 14, margin: "10px 0 0" }}>
              Last visit: {OUTCOME_LABEL[a.last_visit.outcome]}, {fmtWhen(a.last_visit.t)}
            </p>
          )}
        </section>

        {a.live && <LiveSensor live={live} onRequestCheckin={onRequestCheckin} sim={sim} />}

        <section aria-labelledby="chart-title">
          <h3 id="chart-title">Indoor temperature, last 24 h and next 6 h</h3>
          <div className="chart-legend" aria-hidden="true">
            <span><i className="line-key" style={{ borderColor: "var(--chart)" }} />Indoors</span>
            <span><i className="line-key" style={{ borderColor: "var(--chart)", borderTopStyle: "dashed" }} />Forecast</span>
            <span><i className="line-key" style={{ borderColor: "#9a9a9a" }} />Outdoors</span>
            {smokeSpans.length > 0 && <span><i className="swatch" style={{ background: "var(--smoke)" }} />Smoke</span>}
          </div>
          <div style={{ height: 220 }} role="img" aria-label={`Indoor temperature now ${fmtC(a.indoor_c)}; ${a.hours_above_31} of the last 24 hours at or above 31°C.`}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 14, right: 40, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke="#efeeec" />
                {smokeSpans.map(([x1, x2]) => (
                  <ReferenceArea key={x1} x1={x1} x2={x2} fill="#e4ddd0" fillOpacity={0.8} ifOverflow="extendDomain" />
                ))}
                <XAxis dataKey="t" tickFormatter={fmtTime} tick={{ fontSize: 11, fill: "#5e5e5e" }} interval={5} tickLine={false} axisLine={{ stroke: "#d4d4d4" }} />
                <YAxis domain={[14, (max: number) => Math.max(36, Math.ceil(max + 1))]} tick={{ fontSize: 11, fill: "#5e5e5e" }} tickLine={false} axisLine={false} unit="°" width={44} />
                <ReferenceLine y={31} stroke="#c4242a" strokeDasharray="4 3" label={{ value: "31°C", position: "right", fontSize: 11, fill: "#831c1e" }} />
                <ReferenceLine y={26} stroke="#c26a00" strokeDasharray="4 3" label={{ value: "26°C", position: "right", fontSize: 11, fill: "#7a3d00" }} />
                <ReferenceLine x={now} stroke="#141414" label={{ value: "now", position: "top", fontSize: 11, fill: "#141414" }} />
                <Tooltip formatter={(v: number, k: string) => [fmtC(v), k === "outdoor_c" ? "Outdoors" : "Indoors"]} labelFormatter={(l: string) => fmtWhen(l)} />
                <Line dataKey="outdoor_c" stroke="#9a9a9a" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line dataKey="past" stroke="#1d5fbf" strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line dataKey="ahead" stroke="#1d5fbf" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section aria-labelledby="score-title">
          <h3 id="score-title">How the score is built</h3>
          <p className="formula num">
            Score <strong>{a.score.toFixed(1)}</strong> = heat exposure {b.exposure_norm.toFixed(2)} × (1 + vulnerability {b.vulnerability} ÷ 5), scaled to 100.
            Exposure is {b.exposure.toFixed(0)} degree-hours above 26°C in the last 24 h{b.hot_night ? ", including a night that never cooled below 26°C" : ""}.
          </p>
          <table className="factors">
            <caption className="sr-only">Vulnerability points</caption>
            <tbody>
              {b.factors.map((f) => (
                <tr key={f.label}>
                  <td>{f.label}</td>
                  <td className="num">+{f.points}</td>
                </tr>
              ))}
              <tr>
                <td><strong>Vulnerability</strong></td>
                <td className="num"><strong>{b.vulnerability}</strong></td>
              </tr>
            </tbody>
          </table>
        </section>

        <section aria-labelledby="home-title">
          <h3 id="home-title">Person and home</h3>
          <dl className="facts">
            <dt>Home</dt><dd>{home}</dd>
            <dt>Lives</dt><dd>{p.lives_alone ? "Alone" : "With family or partner"}</dd>
            <dt>Conditions</dt><dd>{p.conditions.length ? p.conditions.join(", ") : "None recorded"}</dd>
            <dt>Mobility</dt><dd>{p.mobility_limited ? "Limited" : "Independent"}{p.cognitive_impairment ? " · cognitive impairment" : ""}</dd>
            <dt>Indoors now</dt><dd className="num">{fmtC(a.indoor_c)} · {a.hours_above_31} h ≥ 31°C, {a.hours_above_26} h &gt; 26°C in 24 h</dd>
          </dl>
          <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>Synthetic client. No real person or address.</p>
        </section>
      </div>
    </aside>
  );
}
