import type { Outcome } from "../types";

export default function VisitButtons({ onVisit, busy }: { onVisit: (o: Outcome) => void; busy: boolean }) {
  return (
    <div className="visit-buttons">
      <button className="btn" disabled={busy} onClick={() => onVisit("ok")}>Checked, OK</button>
      <button className="btn primary" disabled={busy} onClick={() => onVisit("moved_to_cooling")}>Moved to cooling centre</button>
      <button className="btn danger" disabled={busy} onClick={() => onVisit("called_911")}>Called 911</button>
    </div>
  );
}
