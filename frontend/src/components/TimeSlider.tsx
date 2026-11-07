import { useMemo } from "react";
import type { Hour } from "../types";
import { fmtC, fmtDay, fmtTime, parts } from "../format";

const T_MIN = 8;
const T_MAX = 42;
const HEAT = 29;

interface Props {
  hours: Hour[];
  index: number;
  onChange: (i: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
}

/** Outdoor temperature for the whole event as a bar strip; the slider sits on top of it. */
export default function TimeSlider({ hours, index, onChange, playing, onTogglePlay }: Props) {
  const n = hours.length;
  const W = 1000;
  const H = 56;
  const bw = W / Math.max(n, 1);

  const smokeSpans = useMemo(() => {
    const spans: [number, number][] = [];
    hours.forEach((h, i) => {
      if (!h.smoke) return;
      const last = spans[spans.length - 1];
      if (last && last[1] === i - 1) last[1] = i;
      else spans.push([i, i]);
    });
    return spans;
  }, [hours]);

  const midnights = useMemo(() => hours.map((h, i) => (parts(h.t).hm === "00:00" ? i : -1)).filter((i) => i >= 0), [hours]);
  const hour = hours[index];
  if (!hour) return null;
  const y = (c: number) => H - ((Math.min(Math.max(c, T_MIN), T_MAX) - T_MIN) / (T_MAX - T_MIN)) * H;

  return (
    <div className="timeline" role="group" aria-label="Time">
      <div className="controls">
        <button className="btn icon" onClick={() => onChange(Math.max(0, index - 1))} aria-label="Back one hour" disabled={index === 0}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>
        </button>
        <button className="btn icon" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play through the event"} aria-pressed={playing}>
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10" fill="currentColor" /><rect x="9.5" y="3" width="3" height="10" fill="currentColor" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
          )}
        </button>
        <button className="btn icon" onClick={() => onChange(Math.min(n - 1, index + 1))} aria-label="Forward one hour" disabled={index === n - 1}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>
        </button>
      </div>

      <div className="strip">
        <svg viewBox={`0 0 ${W} ${H + 16}`} preserveAspectRatio="none" aria-hidden="true">
          {smokeSpans.map(([a, b]) => (
            <rect key={a} x={a * bw} y={0} width={(b - a + 1) * bw} height={H} fill="var(--smoke)" />
          ))}
          <line x1={0} x2={W} y1={y(HEAT)} y2={y(HEAT)} stroke="#c9c6c0" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          {hours.map((h, i) => {
            const past = i <= index;
            const hot = h.outdoor_c >= HEAT;
            const fill = hot ? (past ? "var(--red)" : "#e9b3b1") : past ? "#4a4a4a" : "#cfcdc9";
            return <rect key={h.t} x={i * bw + bw * 0.12} y={y(h.outdoor_c)} width={bw * 0.76} height={H - y(h.outdoor_c)} fill={fill} />;
          })}
          {midnights.map((i) => (
            <line key={i} x1={i * bw} x2={i * bw} y1={H} y2={H + 4} stroke="#9a9a9a" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={(index + 0.5) * bw} x2={(index + 0.5) * bw} y1={-4} y2={H + 4} stroke="var(--text)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: H + 2, height: 14, pointerEvents: "none" }} aria-hidden="true">
          {midnights.map((i, k) => (
            <span key={i} className={k % 2 ? "day-odd" : undefined} style={{ position: "absolute", left: `${(i / n) * 100}%`, fontSize: 11, color: "var(--muted)", paddingLeft: 3, whiteSpace: "nowrap" }}>
              {fmtDay(hours[i].t).slice(4)}
            </span>
          ))}
        </div>
        <label className="sr-only" htmlFor="time-range">Time of day during the heat event</label>
        <input
          id="time-range"
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={index}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`${fmtDay(hour.t)} ${fmtTime(hour.t)}, ${fmtC(hour.outdoor_c)} outside${hour.smoke ? ", smoke" : ""}`}
        />
      </div>

      <div className="readout" aria-live="polite">
        <div className="when num">{fmtDay(hour.t)} · {fmtTime(hour.t)}</div>
        <div className="temp num">
          {fmtC(hour.outdoor_c)} outside{hour.smoke ? " · smoke" : ""}
        </div>
      </div>
    </div>
  );
}
