import type { DispositionId, FactionId, GameState } from "@osg/engine";

/** A faction's display name. */
export function nameOf(state: GameState, id: FactionId | undefined): string {
  if (!id) return "";
  return state.factions[id]?.name ?? id;
}

export const DISPOSITION_LABEL: Record<DispositionId, string> = {
  hostile: "Hostile",
  wary: "Wary",
  neutral: "Neutral",
  open: "Open",
  allied: "Allied"
};

export function DispositionBadge({ value }: { value: DispositionId }) {
  return <span className={`badge disp-${value}`}>{DISPOSITION_LABEL[value]}</span>;
}

/** The Crisis Clock as a row of boxes, Escalations marked, the Breaking Point last. */
export function ClockBar({ state }: { state: GameState }) {
  const { clock } = state;
  return (
    <div className="clock" aria-label={`Crisis Clock ${clock.position} of ${clock.length}`}>
      {Array.from({ length: clock.length }, (_, i) => {
        const box = i + 1;
        const esc = clock.escalations.find((e) => e.box === box);
        const filled = box <= clock.position;
        return (
          <span
            key={box}
            className={`clock-box${filled ? " filled" : ""}${esc ? " escalation" : ""}${esc?.breakingPoint ? " breaking" : ""}${esc?.landed ? " landed" : ""}`}
            title={esc ? `${box}: ${esc.title}` : `Box ${box}`}
          />
        );
      })}
      <span className="clock-label">
        {clock.position}/{clock.length}
      </span>
    </div>
  );
}

/** Standing, Dominant first. */
export function StandingList({ state }: { state: GameState }) {
  return (
    <ol className="standing">
      {state.standing.map((id) => (
        <li key={id} className={id === state.player ? "you" : undefined}>
          {nameOf(state, id)}
          {id === state.player && <span className="you-tag">you</span>}
        </li>
      ))}
    </ol>
  );
}

export const STEP_NAMES = ["Take stock", "Talk", "Declare", "AA actions", "Adjudicate", "Signals", "Update", "Report"] as const;
