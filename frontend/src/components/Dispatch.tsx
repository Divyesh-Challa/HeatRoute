import type { Route, VisitRecord } from "../types";
import BandPill from "./BandPill";
import { OUTCOME_LABEL, fmtTime, fmtWhen, workerColour } from "../format";

interface Props {
  workers: number;
  setWorkers: (n: number) => void;
  topN: number;
  setTopN: (n: number) => void;
  routes: Route[] | null;
  onPlan: () => void;
  onClear: () => void;
  planning: boolean;
  onSelect: (id: string) => void;
  visits: VisitRecord[];
  openCount: number;
}

function Stepper({ label, value, set, min, max }: { label: string; value: number; set: (n: number) => void; min: number; max: number }) {
  const id = `step-${label.replace(/\W/g, "")}`;
  return (
    <span className="stepper">
      <span id={id}>{label}</span>
      <button className="btn icon" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => set(Math.max(min, value - 1))} disabled={value <= min}>−</button>
      <output aria-labelledby={id} className="num">{value}</output>
      <button className="btn icon" aria-label={`More ${label.toLowerCase()}`} onClick={() => set(Math.min(max, value + 1))} disabled={value >= max}>+</button>
    </span>
  );
}

export default function Dispatch({ workers, setWorkers, topN, setTopN, routes, onPlan, onClear, planning, onSelect, visits, openCount }: Props) {
  const covered = routes?.reduce((s, r) => s + r.stops.length, 0) ?? 0;
  return (
    <section className="panel dispatch" aria-labelledby="dispatch-title">
      <div className="panel-head">
        <h2 id="dispatch-title">Dispatch</h2>
        <span className="meta">
          {routes ? `${covered} visits across ${routes.length} workers · urgent clients first` : `${openCount} clients waiting`}
        </span>
      </div>
      <div className="dispatch-controls">
        <Stepper label="Workers" value={workers} set={setWorkers} min={1} max={8} />
        <Stepper label="Visits" value={topN} set={setTopN} min={1} max={30} />
        <span style={{ flex: 1 }} />
        {routes && (
          <>
            <button className="btn" onClick={() => window.print()}>Print route sheet</button>
            <button className="btn" onClick={onClear}>Clear</button>
          </>
        )}
        <button className="btn primary" onClick={onPlan} disabled={planning}>
          {routes ? "Re-plan routes" : "Plan routes"}
        </button>
      </div>
      {routes ? (
        routes.some((r) => r.stops.length) ? (
          <div className="routes">
            {routes.map((r) => (
              <div className="route" key={r.worker}>
                <h3>
                  <i className="swatch" style={{ background: workerColour(r.worker) }} aria-hidden="true" />
                  <span style={{ whiteSpace: "nowrap" }}>Worker {r.worker}</span>
                </h3>
                <p className="route-meta num">
                  {r.stops.length} stops · {r.distance_km} km · done {fmtTime(r.finish)}
                </p>
                <ol>
                  {r.stops.map((s) => (
                    <li key={s.client_id}>
                      <span className="num muted">{fmtTime(s.eta)}</span>
                      <button onClick={() => onSelect(s.client_id)}>{s.name}</button>
                      <BandPill band={s.band} />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">No client is urgent or on watch right now, so there is nothing to route.</p>
        )
      ) : visits.length ? (
        <div className="routes">
          <div className="route" style={{ gridColumn: "1 / -1" }}>
            <h3>Visits logged</h3>
            <ol>
              {visits.slice(0, 6).map((v, i) => (
                <li key={i} style={{ gridTemplateColumns: "110px 1fr auto" }}>
                  <span className="num muted">{fmtWhen(v.t)}</span>
                  <button onClick={() => onSelect(v.client_id)}>{v.name}</button>
                  <span className="pill neutral">{OUTCOME_LABEL[v.outcome]}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <p className="empty">Set how many workers are on shift, then plan routes. Each worker's first stop is one of the most urgent clients.</p>
      )}
    </section>
  );
}
