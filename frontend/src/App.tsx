import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { ClientDetail as Detail, Outcome, Ranked, Route, Scenario, Timeline, VisitRecord } from "./types";
import TimeSlider from "./components/TimeSlider";
import RankedList from "./components/RankedList";
import RouteMap from "./components/RouteMap";
import Dispatch from "./components/Dispatch";
import ClientDetail from "./components/ClientDetail";
import { OUTCOME_LABEL, fmtC, fmtTime, fmtWhen } from "./format";

const DEFAULT_SCENARIO = "edmonton_2024";
const PLAY_MS = 450;

// Scenario and time live in the URL so a demo moment can be bookmarked: ?scenario=edmonton_2024&t=2024-07-17T18:00
function readUrl() {
  const p = new URLSearchParams(window.location.search);
  return {
    scenario: p.get("scenario") ?? DEFAULT_SCENARIO,
    t: p.get("t"),
    client: p.get("client"),
    routes: p.get("routes") === "1",
  };
}

export default function App() {
  const initial = useRef(readUrl());
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioId, setScenarioId] = useState(initial.current.scenario);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [idx, setIdx] = useState(0);
  const [ranked, setRanked] = useState<Ranked | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [workers, setWorkers] = useState(3);
  const [topN, setTopN] = useState(12);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [routesOn, setRoutesOn] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [version, setVersion] = useState(0); // bumps when the visit log changes
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scenario = scenarios.find((s) => s.id === scenarioId);
  const t = timeline?.hours[idx]?.t ?? null;

  useEffect(() => {
    api.scenarios().then(setScenarios).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    setTimeline(null);
    setRanked(null);
    setRoutes(null);
    setRoutesOn(false);
    setSelectedId(null);
    api
      .timeline(scenarioId)
      .then((tl) => {
        setTimeline(tl);
        const want = initial.current.scenario === scenarioId ? initial.current.t : null;
        const at = want ? tl.hours.findIndex((h) => h.t === want) : -1;
        setIdx(at >= 0 ? at : Math.min(9, tl.hours.length - 1));
        if (want) {
          setSelectedId(initial.current.client);
          setRoutesOn(initial.current.routes);
        }
        initial.current = { scenario: "", t: null, client: null, routes: false };
      })
      .catch((e) => setError(String(e)));
    api.visits(scenarioId).then(setVisits).catch(() => {});
  }, [scenarioId]);

  useEffect(() => {
    if (!t) return;
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", scenarioId);
    url.searchParams.set("t", t);
    if (selectedId) url.searchParams.set("client", selectedId);
    else url.searchParams.delete("client");
    if (routesOn) url.searchParams.set("routes", "1");
    else url.searchParams.delete("routes");
    window.history.replaceState(null, "", url);
  }, [scenarioId, t, selectedId, routesOn]);

  // Latest-request-wins so dragging the slider never shows a stale hour.
  const reqId = useRef(0);
  useEffect(() => {
    if (!t) return;
    const id = ++reqId.current;
    api
      .ranked(scenarioId, t)
      .then((r) => {
        if (id === reqId.current) {
          setRanked(r);
          setError(null);
        }
      })
      .catch((e) => setError(`Could not load the queue: ${e.message}`));
  }, [scenarioId, t, version]);

  useEffect(() => {
    if (!t || !selectedId) {
      setDetail(null);
      return;
    }
    let live = true;
    api.client(scenarioId, selectedId, t).then((d) => live && setDetail(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, [scenarioId, selectedId, t, version]);

  // Routes follow the clock and the visit log once the coordinator has asked for them.
  useEffect(() => {
    if (!routesOn || !t) return;
    const handle = setTimeout(() => {
      setPlanning(true);
      api
        .routes(scenarioId, t, workers, topN)
        .then(setRoutes)
        .catch((e) => setError(`Could not plan routes: ${e.message}`))
        .finally(() => setPlanning(false));
    }, playing ? 0 : 120);
    return () => clearTimeout(handle);
  }, [routesOn, scenarioId, t, workers, topN, version, playing]);

  useEffect(() => {
    if (!playing || !timeline) return;
    const h = setInterval(() => {
      setIdx((i) => {
        if (i >= timeline.hours.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, PLAY_MS);
    return () => clearInterval(h);
  }, [playing, timeline]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(h);
  }, [toast]);

  const logVisit = useCallback(
    async (outcome: Outcome) => {
      if (!selectedId || !t) return;
      setBusy(true);
      const name = ranked?.clients.find((c) => c.client_id === selectedId)?.name ?? "Client";
      const before = ranked?.clients.find((c) => c.client_id === selectedId)?.rank;
      try {
        await api.logVisit(scenarioId, selectedId, t, outcome);
        setVisits(await api.visits(scenarioId));
        setVersion((v) => v + 1);
        setToast(`${name}: ${OUTCOME_LABEL[outcome].toLowerCase()} at ${fmtTime(t)}${before ? `. Was #${before}; queue re-ranked.` : "."}`);
      } catch (e) {
        setError(`Could not log the visit: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [selectedId, t, scenarioId, ranked],
  );

  const reset = async () => {
    await api.reset(scenarioId);
    setVisits([]);
    setRoutes(null);
    setRoutesOn(false);
    setSelectedId(null);
    setVersion((v) => v + 1);
    setToast("Visit log cleared for this scenario.");
  };

  const closeDetail = useCallback(() => setSelectedId(null), []);

  const summary = useMemo(() => {
    if (!ranked || !timeline) return null;
    const open = ranked.clients.filter((c) => c.status === "needs_visit");
    const top = open[0];
    const turning = open.filter((c) => c.band !== "red" && c.forecast_band === "red").length;
    const day = timeline.hours.slice(Math.max(0, idx - 23), idx + 1);
    const high = Math.max(...day.map((h) => h.outdoor_c));
    return { open, top, turning, high };
  }, [ranked, timeline, idx]);

  const forecastAt = timeline?.hours[Math.min(idx + 6, (timeline?.hours.length ?? 1) - 1)]?.t ?? null;
  const urgent = ranked?.counts.red ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">
          <img src="/favicon.svg" alt="" />
          HeatRoute
        </div>
        <span className="tagline muted no-print">Heat-wave visit triage for home care</span>
        <span className="spacer" />
        <label htmlFor="scenario" className="event-label">Event</label>
        <select id="scenario" className="select" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <button className="btn" onClick={reset}>Reset demo</button>
      </header>

      <div className="titlerow">
        <div>
          <h1 className="num">{t ? `Who needs a visit · ${fmtWhen(t)}` : "Who needs a visit"}</h1>
          {summary && (
            <p className="finding">
              {summary.top && summary.top.band !== "green" ? (
                <>
                  <strong>{summary.top.name}, {summary.top.age}</strong> is most at risk: {summary.top.reasons.slice(0, 2).join(", ")}.{" "}
                  {summary.top.phone_list_rank > 5 && <>An oldest-first call list would reach {summary.top.name.split(" ")[0]} at call #{summary.top.phone_list_rank}. </>}
                  {summary.turning > 0 && <>{summary.turning} more {summary.turning === 1 ? "client turns" : "clients turn"} urgent by {fmtTime(forecastAt!)}.</>}
                </>
              ) : (
                <>No client's home has been hot long enough to need a visit. Outdoor high in the last 24 h: {fmtC(summary.high)}.</>
              )}
            </p>
          )}
          {ranked && (ranked.heat_warning || ranked.smoke) && (
            <div className="notices">
              {ranked.heat_warning && (
                <span className="notice heat"><span className="dot" aria-hidden="true" />Heat warning conditions: outdoor high {fmtC(summary?.high ?? ranked.outdoor_c)}</span>
              )}
              {ranked.smoke && (
                <span className="notice smoke"><span className="dot" aria-hidden="true" />Wildfire smoke: windows stay shut, homes without AC cannot cool overnight</span>
              )}
            </div>
          )}
        </div>
        {ranked && (
          <dl className="counts num" aria-label="Clients by risk">
            <div><dt><i className="swatch" style={{ background: "var(--red)" }} />Urgent</dt><dd>{urgent}</dd></div>
            <div><dt><i className="swatch" style={{ background: "var(--amber)" }} />Watch</dt><dd>{ranked.counts.amber}</dd></div>
            <div><dt><i className="swatch" style={{ background: "var(--green)" }} />OK</dt><dd>{ranked.counts.green}</dd></div>
            <div><dt>Handled</dt><dd>{ranked.counts.handled}</dd></div>
          </dl>
        )}
      </div>

      {timeline ? (
        <TimeSlider hours={timeline.hours} index={idx} onChange={(i) => setIdx(i)} playing={playing} onTogglePlay={() => setPlaying((p) => !p)} />
      ) : (
        <div className="timeline" style={{ height: 94 }} aria-busy="true" />
      )}

      {error && <div className="error" role="alert">{error}</div>}

      <main className="main">
        {ranked ? (
          <RankedList clients={ranked.clients} selectedId={selectedId} onSelect={setSelectedId} forecastAt={forecastAt} />
        ) : (
          <section className="panel ranked" aria-busy="true"><div className="panel-head"><h2>Visit queue</h2></div><p className="empty">Loading the queue…</p></section>
        )}
        <div className="right">
          {scenario && ranked && (
            <RouteMap center={scenario.center} office={scenario.office} clients={ranked.clients} routes={routes} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {!(scenario && ranked) && <div className="mapwrap" />}
          <Dispatch
            workers={workers}
            setWorkers={setWorkers}
            topN={topN}
            setTopN={setTopN}
            routes={routes}
            planning={planning}
            onPlan={() => {
              setRoutesOn(true);
              setVersion((v) => v + 1);
            }}
            onClear={() => {
              setRoutesOn(false);
              setRoutes(null);
            }}
            onSelect={setSelectedId}
            visits={visits}
            openCount={summary?.open.length ?? 0}
          />
          {selectedId && t && (
            <ClientDetail detail={detail?.profile.id === selectedId ? detail : null} now={t} total={ranked?.clients.length ?? 0} onClose={closeDetail} onVisit={logVisit} busy={busy} />
          )}
        </div>
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
