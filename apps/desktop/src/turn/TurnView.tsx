import type { Command, Decision, GameState, Requirements } from "@osg/engine";
import { ChevronRight } from "lucide-react";
import { STEP_NAMES } from "../components/game-bits";

export interface StepProps {
  state: GameState;
  requirements: Requirements;
  run: (command: Command) => Promise<boolean>;
}

/** The centre of the game screen: the current step, its open decisions, and Advance. */
export function TurnView({ state, requirements, run }: StepProps) {
  const { decisions, canAdvance } = requirements;

  if (state.status === "setup") {
    return (
      <section className="step-view">
        <h2>{state.scenario.title}</h2>
        <blockquote className="problem">{state.scenario.problem}</blockquote>
        <p>{state.scenario.world}</p>
        <button className="primary" onClick={() => run({ type: "startGame" })}>
          Start the game
        </button>
      </section>
    );
  }
  if (!state.turnOpen) {
    return (
      <section className="step-view">
        {state.status === "ended" ? (
          <h2>The game is over</h2>
        ) : (
          <>
            <h2>{state.turn === 0 ? "Ready for Turn 1" : `Turn ${state.turn} is over`}</h2>
            <button className="primary" onClick={() => run({ type: "openTurn" })}>
              Open turn {state.turn + 1}
            </button>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="step-view">
      <header className="step-header">
        <h2>
          {state.step}. {STEP_NAMES[state.step - 1]}
        </h2>
        <button className="primary" disabled={!canAdvance} onClick={() => run({ type: "advance" })} title={canAdvance ? "Next step" : "Answer the open decisions first"}>
          Next step <ChevronRight size={16} />
        </button>
      </header>
      {decisions.length > 0 && (
        <ul className="decisions">
          {decisions.map((d, i) => (
            <li key={i}>{describe(d)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describe(d: Decision): string {
  return "aa" in d ? `${d.kind} (${d.aa})` : "action" in d ? `${d.kind} (${d.action})` : d.kind;
}
