import { useEffect, useRef } from "react";
import type { RankedClient } from "../types";
import BandPill from "./BandPill";
import { STATUS_LABEL, fmtC, fmtTime } from "../format";

interface Props {
  clients: RankedClient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  forecastAt: string | null;
}

const BAND_ORDER = { green: 0, amber: 1, red: 2, unknown: -1 } as const;

export default function RankedList({ clients, selectedId, onSelect, forecastAt }: Props) {
  const open = clients.filter((c) => c.status === "needs_visit");
  const handled = clients.filter((c) => c.status !== "needs_visit");
  const refs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (selectedId) refs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // Arrow keys move through the queue like a list of mail.
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const order = [...open, ...handled];
    const next = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : -1;
    if (next < 0 || next >= order.length || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const id = order[next].client_id;
    refs.current.get(id)?.focus();
    onSelect(id);
  };

  const row = (c: RankedClient, i: number) => {
    const worsening = c.status === "needs_visit" && BAND_ORDER[c.forecast_band] > BAND_ORDER[c.band];
    return (
      <li key={c.client_id}>
        <button
          ref={(el) => {
            if (el) refs.current.set(c.client_id, el);
          }}
          className="row"
          aria-current={c.client_id === selectedId}
          onClick={() => onSelect(c.client_id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          <span className="rank num">{c.status === "needs_visit" ? c.rank : "–"}</span>
          <span className="who">
            <span className="name">{c.name}</span>
            <span className="age num">{c.age}</span>
            {c.status === "needs_visit" ? <BandPill band={c.band} /> : <span className="pill neutral">{STATUS_LABEL[c.status]}</span>}
            <span className="muted" style={{ fontSize: 13 }}>{c.neighbourhood}</span>
          </span>
          <span className="indoor">
            <span className="val num">{fmtC(c.indoor_c)}</span>
            <span className="lbl">indoors</span>
          </span>
          <span className="reasons">
            {c.reasons.map((r) => (
              <span key={r}>{r}</span>
            ))}
          </span>
          {worsening && forecastAt && (
            <span className="forecast">
              Forecast: {c.forecast_band === "red" ? "urgent" : "watch"} by {fmtTime(forecastAt)}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <section className="panel ranked" aria-labelledby="queue-title">
      <div className="panel-head">
        <h2 id="queue-title">Visit queue</h2>
        <span className="meta num">{open.length} open · ranked by heat exposure × vulnerability</span>
      </div>
      <ul className="list">
        {open.map((c, i) => row(c, i))}
        {handled.length > 0 && (
          <li className="list-sub" aria-hidden="true">
            Handled ({handled.length})
          </li>
        )}
        {handled.map((c, i) => row(c, open.length + i))}
      </ul>
    </section>
  );
}
