import { useEffect, useRef } from "react";
import type { TourStep } from "../tour";

interface Props {
  steps: TourStep[];
  index: number;
  busy: boolean;
  onGo: (i: number) => void;
  onExit: () => void;
}

/** A caption bar for the guided demo. Presentation clickers send PageDown/PageUp, so those work too. */
export default function GuidedTour({ steps, index, busy, onGo, onExit }: Props) {
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    next.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, select, textarea, .leaflet-container")) return;
      if (["PageDown", "ArrowRight"].includes(e.key) && !last) {
        e.preventDefault();
        onGo(index + 1);
      } else if (["PageUp", "ArrowLeft"].includes(e.key) && index > 0) {
        e.preventDefault();
        onGo(index - 1);
      } else if (e.key === "Escape" && !document.querySelector(".drawer")) {
        onExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, last, onGo, onExit]);

  return (
    <section className="tour" aria-label="Guided demo" aria-live="polite">
      <div className="tour-progress num" aria-label={`Step ${index + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <button
            key={i}
            className={i === index ? "on" : i < index ? "done" : undefined}
            onClick={() => onGo(i)}
            aria-label={`Go to step ${i + 1}`}
            aria-current={i === index ? "step" : undefined}
          />
        ))}
      </div>
      <div className="tour-copy">
        <h2>{step.title}</h2>
        <p>{step.text}</p>
      </div>
      <div className="tour-actions">
        <button className="btn ghost" onClick={() => onGo(index - 1)} disabled={index === 0 || busy}>Back</button>
        {last ? (
          <button ref={next} className="btn inverse" onClick={onExit}>Finish</button>
        ) : (
          <button ref={next} className="btn inverse" onClick={() => onGo(index + 1)} disabled={busy}>Next</button>
        )}
        <button className="btn ghost" onClick={onExit} aria-label="Exit guided demo">Exit</button>
      </div>
    </section>
  );
}
