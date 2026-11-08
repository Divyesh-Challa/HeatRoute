import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { ClientDetail as Detail, LiveStatus, Outcome, Ranked, Route, Scenario, Timeline, VisitRecord } from "./types";
import TimeSlider from "./components/TimeSlider";
import RankedList from "./components/RankedList";
import RouteMap from "./components/RouteMap";
import Dispatch from "./components/Dispatch";
import ClientDetail from "./components/ClientDetail";
import GuidedTour from "./components/GuidedTour";
import { TOUR, type QueueOrder, type TourStep } from "./tour";
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

type Target = { scenario: string; t: string | null; client: string | null; routes: boolean };

// Display preferences are per viewer conveniences; storage can be unavailable, so every access is guarded.
function loadPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function savePref(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* private mode: the toggle still works for this visit */
  }
}

function urlFlag(key: string, on: string): boolean | null {
  const v = new URLSearchParams(window.location.search).get(key);
  return v === null ? null : v === on;
}

export default function App() {
  const initial = useRef<Target>(readUrl());
  const tourPending = useRef<(() => void) | null>(null); // runs once a newly chosen scenario has loaded
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
  const [order, setOrder] = useState<QueueOrder>("heatroute");
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [tourBusy, setTourBusy] = useState(false);
  // ?text=large and ?contrast=high override the saved preference (handy for a shared link or a projector).
  const [largeText, setLargeText] = useState(() => urlFlag("text", "large") ?? loadPref("hr-large-text", false));
  const [highContrast, setHighContrast] = useState(
    () => urlFlag("contrast", "high") ?? loadPref("hr-high-contrast", window.matchMedia?.("(prefers-contrast: more)").matches ?? false),
  );

  useEffect(() => {
    document.documentElement.dataset.text = largeText ? "large" : "normal";
    savePref("hr-large-text", largeText);
  }, [largeText]);
  useEffect(() => {
    document.documentElement.dataset.contrast = highContrast ? "high" : "normal";
    savePref("hr-high-contrast", highContrast);
  }, [highContrast]);

  // Read through refs in goTo: tour steps await the network first, and captured state would be stale by then.
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const scenarioRef = useRef(scenarioId);
  scenarioRef.current = scenarioId;

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
        timelineRef.current = tl; // visible to goTo before React commits the state
        setTimeline(tl);
        const want = initial.current.scenario === scenarioId ? initial.current.t : null;
        const at = want ? tl.hours.findIndex((h) => h.t === want) : -1;
        setIdx(at >= 0 ? at : Math.min(9, tl.hours.length - 1));
        if (want) {
          setSelectedId(initial.current.client);
          setRoutesOn(initial.current.routes);
        }
        initial.current = { scenario: "", t: null, client: null, routes: false };
        if (tourPending.current) {
          tourPending.current();
          tourPending.current = null;
        }
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

  // Live sensors: poll every 2 s while the tab is visible; any change refetches the queue through `version`.
  const liveRev = useRef<string | null>(null);
  const prevLive = useRef<LiveStatus | null>(null);
  const pollLive = useCallback(async () => {
    try {
      const l = await api.live();
      setLive(l);
      if (liveRev.current !== null && l.rev !== liveRev.current) setVersion((v) => v + 1);
      liveRev.current = l.rev;
      const p = prevLive.current;
      if (p) {
        if (l.checkin === "help" && p.checkin !== "help") setToast(`${l.client_name} pressed Help. Moved to the top of the queue.`);
        else if (l.checkin === "ok" && p.checkin !== "ok") setToast(`${l.client_name} pressed I'm OK.`);
        if (l.prompt_missed && !p.prompt_missed) setToast(`${l.client_name} missed a check-in.`);
        if (l.hr_elevated && !p.hr_elevated) setToast(`${l.client_name}: heart rate ${l.hr_bpm} bpm.`);
      }
      prevLive.current = l;
    } catch {
      /* the live feed is optional; the queue keeps working without it */
    }
  }, []);
  useEffect(() => {
    pollLive();
    const h = setInterval(() => document.visibilityState === "visible" && pollLive(), 2000);
    return () => clearInterval(h);
  }, [pollLive]);

  const simulate = useCallback(
    async (body: { hr_bpm?: number; event?: "ok" | "help" }) => {
      await api.postLive({ device_id: "sim", ...body }).catch((e) => setError(`Simulator: ${e.message}`));
      pollLive();
    },
    [pollLive],
  );
  // The simulator keeps sending while it is on, even with the drawer closed, like a worn device would.
  const [simHr, setSimHr] = useState(72);
  const [simStreaming, setSimStreaming] = useState(false);
  useEffect(() => {
    if (!simStreaming) return;
    const send = () => api.postLive({ device_id: "sim", hr_bpm: simHr }).catch(() => {});
    const debounce = setTimeout(() => send().then(pollLive), 250);
    const h = setInterval(send, 4000);
    return () => {
      clearTimeout(debounce);
      clearInterval(h);
    };
  }, [simStreaming, simHr, pollLive]);
  const sim = useMemo(
    () => ({ hr: simHr, setHr: setSimHr, streaming: simStreaming, setStreaming: setSimStreaming, press: (event: "ok" | "help") => simulate({ event }) }),
    [simHr, simStreaming, simulate],
  );

  const requestCheckin = useCallback(async () => {
    if (!live) return;
    await api.requestCheckin(live.client_id).catch((e) => setError(`Check-in request failed: ${e.message}`));
    setToast(`Check-in requested from ${live.client_name}. No answer in 45 s counts as missed.`);
    pollLive();
  }, [live, pollLive]);

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
    setSimStreaming(false);
    await api.reset(scenarioId);
    setVisits([]);
    setRoutes(null);
    setRoutesOn(false);
    setSelectedId(null);
    setVersion((v) => v + 1);
    setToast("Visit log cleared for this scenario.");
  };

  const closeDetail = useCallback(() => setSelectedId(null), []);

  // Jump to a scenario + hour (+ open client, + routes). Crossing scenarios waits for the new timeline.
  const goTo = useCallback(
    (target: Target, then?: () => void) => {
      setPlaying(false);
      const tl = timelineRef.current;
      if (target.scenario !== scenarioRef.current || !tl || tl.scenario !== target.scenario) {
        // The timeline effect picks the target up when the scenario's timeline arrives.
        initial.current = target;
        tourPending.current = then ?? null;
        setScenarioId(target.scenario);
        return;
      }
      const at = tl.hours.findIndex((h) => h.t === target.t);
      if (at >= 0) setIdx(at);
      setSelectedId(target.client);
      setRoutesOn(target.routes);
      if (!target.routes) setRoutes(null);
      then?.();
    },
    [],
  );

  // The tour owns the visit log for its scenario: steps before the cooling-centre visit see an empty log.
  const tourVisitLogged = useRef(false);
  const runStep = useCallback(
    async (i: number) => {
      const step: TourStep = TOUR[i];
      setTourIndex(i);
      setOrder(step.order);
      setTourBusy(true);
      try {
        if (step.visit) {
          await api.reset(step.scenario);
          await api.logVisit(step.scenario, step.visit.client, step.t, step.visit.outcome);
          tourVisitLogged.current = true;
        } else if (tourVisitLogged.current && step.scenario === TOUR[0].scenario) {
          await api.reset(step.scenario);
          tourVisitLogged.current = false;
        }
        if (step.scenario === scenarioRef.current) setVisits(await api.visits(step.scenario));
        setVersion((v) => v + 1);
      } catch (e) {
        setError(`Guided demo step failed: ${(e as Error).message}`);
      } finally {
        setTourBusy(false);
      }
      goTo({ scenario: step.scenario, t: step.t, client: step.client, routes: step.routes });
    },
    [goTo],
  );

  const startTour = async () => {
    tourVisitLogged.current = true; // forces a clean log on the first step
    await runStep(0);
  };
  // ?tour=N opens the guided demo at step N (1-based), so a presenter can resume mid-pitch.
  const tourFromUrl = useRef(Number(new URLSearchParams(window.location.search).get("tour")) || 0);
  useEffect(() => {
    const n = tourFromUrl.current;
    if (!n || !scenarios.length) return;
    tourFromUrl.current = 0;
    tourVisitLogged.current = true;
    runStep(Math.min(Math.max(n, 1), TOUR.length) - 1);
  }, [scenarios, runStep]);

  // Leaving the tour removes the visit it logged, so the next run (guided or not) starts clean.
  const exitTour = useCallback(async () => {
    setTourIndex(null);
    setOrder("heatroute");
    if (tourVisitLogged.current) {
      tourVisitLogged.current = false;
      await api.reset(TOUR[0].scenario).catch(() => {});
      if (scenarioId === TOUR[0].scenario) setVisits([]);
      setVersion((v) => v + 1);
    }
  }, [scenarioId]);

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
        <button className="btn primary" onClick={startTour} disabled={tourIndex !== null}>Guided demo</button>
        <span className="display-toggles" role="group" aria-label="Display">
          <button className="btn toggle" aria-pressed={largeText} onClick={() => setLargeText((v) => !v)} title="Larger text">
            <span aria-hidden="true" className="aa">A<span>A</span></span>
            <span className="toggle-label">Larger text</span>
          </button>
          <button className="btn toggle" aria-pressed={highContrast} onClick={() => setHighContrast((v) => !v)} title="High contrast">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" /></svg>
            <span className="toggle-label">High contrast</span>
          </button>
        </span>
      </header>

      {tourIndex !== null && <GuidedTour steps={TOUR} index={tourIndex} busy={tourBusy} onGo={runStep} onExit={exitTour} />}

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
                <>
                  No client's home has been hot long enough to need a visit yet.{" "}
                  {summary.turning > 0 ? (
                    <>
                      <strong>{summary.turning} {summary.turning === 1 ? "client turns" : "clients turn"} urgent by {fmtTime(forecastAt!)}</strong>, so visits can start now.
                    </>
                  ) : (
                    <>Outdoor high in the last 24 h: {fmtC(summary.high)}.</>
                  )}
                </>
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
          {live && live.devices.length > 0 && (
            <div className="notices">
              <button className={`notice live${live.online ? "" : " off"}`} onClick={() => setSelectedId(live.client_id)}>
                <span className={`dot${live.online ? " live-dot" : ""}`} aria-hidden="true" />
                {live.online ? "Live sensor" : "Sensor offline"} · {live.client_name}
                {live.online && live.hr_bpm !== null && <span className="num"> · {live.hr_bpm} bpm</span>}
              </button>
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
          <RankedList clients={ranked.clients} selectedId={selectedId} onSelect={setSelectedId} forecastAt={forecastAt} order={order} setOrder={setOrder} />
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
            <ClientDetail
              detail={detail?.profile.id === selectedId ? detail : null}
              now={t}
              total={ranked?.clients.length ?? 0}
              onClose={closeDetail}
              onVisit={logVisit}
              busy={busy}
              live={live}
              onRequestCheckin={requestCheckin}
              sim={sim}
            />
          )}
        </div>
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
