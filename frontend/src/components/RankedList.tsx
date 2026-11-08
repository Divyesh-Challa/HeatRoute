import { Fragment, useEffect, useRef } from "react";
import type { RankedClient } from "../types";
import type { QueueOrder } from "../tour";
import BandPill from "./BandPill";
import { STATUS_LABEL, fmtC, fmtTime } from "../format";

interface Props {
  clients: RankedClient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  forecastAt: string | null;
  order: QueueOrder;
  setOrder: (o: QueueOrder) => void;
}

const BAND_ORDER = { green: 0, amber: 1, red: 2, unknown: -1 } as const;

/** What an oldest-first call list does with the clients HeatRoute marks urgent. */
export function phoneListGap(clients: RankedClient[]) {
  const urgent = clients.filter((c) => c.status === "needs_visit" && c.band === "red");
  const n = urgent.length;
  const reached = urgent.filter((c) => c.phone_list_rank <= n).length;
  const lastCall = n ? Math.max(...urgent.map((c) => c.phone_list_rank)) : 0;
  return { n, reached, lastCall };
}

export default function RankedList({ clients, selectedId, onSelect, forecastAt, order, setOrder }: Props) {
  const phone = order === "phone";
  const open = clients.filter((c) => c.status === "needs_visit");
  const handled = clients.filter((c) => c.status !== "needs_visit");
  const byPhone = [...clients].sort((a, b) => a.phone_list_rank - b.phone_list_rank);
  const sequence = phone ? byPhone : [...open, ...handled];
  const gap = phoneListGap(clients);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (selectedId) refs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // Arrow keys move through the queue like a list of mail.
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const next = e.key === "ArrowDown" ? i + 1 : i - 1;
    if (next < 0 || next >= sequence.length) return;
    e.preventDefault();
    e.stopPropagation();
    const id = sequence[next].client_id;
    refs.current.get(id)?.focus();
    onSelect(id);
  };

  const row = (c: RankedClient, i: number) => {
    const worsening = c.status === "needs_visit" && BAND_ORDER[c.forecast_band] > BAND_ORDER[c.band];
    const urgent = c.status === "needs_visit" && c.band === "red";
    const dim = phone && !urgent;
    const cls = [dim ? "dim" : "", phone && urgent ? "flag" : ""].join(" ").trim() || undefined;
    return (
      <Fragment key={c.client_id}>
      <li className={cls}>
        <button
          ref={(el) => {
            if (el) refs.current.set(c.client_id, el);
          }}
          className="row"
          aria-current={c.client_id === selectedId}
          onClick={() => onSelect(c.client_id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          <span className="rank num" aria-label={phone ? `Call ${c.phone_list_rank}` : `Rank ${c.rank}`}>
            {phone ? c.phone_list_rank : c.status === "needs_visit" ? c.rank : "–"}
          </span>
          <span className="who">
            <span className="name">{c.name}</span>
            <span className="age num">{c.age}</span>
            {c.status === "needs_visit" ? <BandPill band={c.band} /> : <span className="pill neutral">{STATUS_LABEL[c.status]}</span>}
            <span className="muted hood">{phone && c.status === "needs_visit" ? `HeatRoute #${c.rank}` : c.neighbourhood}</span>
          </span>
          <span className="indoor">
            <span className="val num">{fmtC(c.indoor_c)}</span>
            {!dim && <span className="lbl">indoors</span>}
          </span>
          {!(phone && dim) && (
            <span className="reasons">
              {c.reasons.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </span>
          )}
          {c.live && !(phone && dim) && (c.live.hr_bpm !== null || c.live.checkin === "help" || c.live.prompt_pending || c.live.prompt_missed) && (
            <span className="live-pills">
              {c.live.hr_bpm !== null && (
                <span className={`pill ${c.live.hr_bpm >= 100 ? "red" : "neutral"}`}>
                  <span className="mark live-dot" aria-hidden="true" />
                  Live <span className="num">{c.live.hr_bpm} bpm</span>
                </span>
              )}
              {c.live.checkin === "help" && <span className="pill red">Pressed Help</span>}
              {c.live.prompt_missed && <span className="pill red">Missed check-in</span>}
              {c.live.prompt_pending && <span className="pill neutral">Check-in requested</span>}
            </span>
          )}
          {worsening && forecastAt && !phone && (
            <span className="forecast">
              Forecast: {c.forecast_band === "red" ? "urgent" : "watch"} by {fmtTime(forecastAt)}
            </span>
          )}
        </button>
      </li>
      {phone && gap.n > 0 && i === gap.n - 1 && (
        <li className="call-line" aria-hidden="true">
          <span>First {gap.n} calls end here</span>
        </li>
      )}
      </Fragment>
    );
  };

  return (
    <section className="panel ranked" aria-labelledby="queue-title">
      <div className="panel-head">
        <h2 id="queue-title">{phone ? "Oldest-first phone list" : "Visit queue"}</h2>
        <div className="segmented" role="group" aria-label="Order the list by">
          <button aria-pressed={!phone} onClick={() => setOrder("heatroute")}>HeatRoute</button>
          <button aria-pressed={phone} onClick={() => setOrder("phone")}>Oldest first</button>
        </div>
      </div>
      {phone ? (
        <p className="list-note">
          {gap.n ? (
            <>
              <strong className="num">{gap.reached} of {gap.n}</strong> urgent clients are reached in the first {gap.n} calls.
              The last one is call <span className="num">#{gap.lastCall}</span>. Urgent clients are highlighted.
            </>
          ) : (
            <>No client is urgent right now. Oldest-first order shown for comparison.</>
          )}
        </p>
      ) : (
        <p className="list-note muted num">{open.length} open · ranked by heat exposure × vulnerability</p>
      )}
      <ul className="list">
        {phone ? (
          sequence.map((c, i) => row(c, i))
        ) : (
          <>
            {open.map((c, i) => row(c, i))}
            {handled.length > 0 && (
              <li className="list-sub" aria-hidden="true">
                Handled ({handled.length})
              </li>
            )}
            {handled.map((c, i) => row(c, open.length + i))}
          </>
        )}
      </ul>
    </section>
  );
}
