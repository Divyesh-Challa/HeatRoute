import type { Band } from "../types";
import { BAND_LABEL } from "../format";

export default function BandPill({ band }: { band: Band }) {
  return (
    <span className={`pill ${band}`}>
      <span className="mark" aria-hidden="true" />
      {BAND_LABEL[band]}
    </span>
  );
}
