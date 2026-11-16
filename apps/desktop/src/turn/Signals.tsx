import { signals as signalTable } from "@osg/rules-data";
import type { Decision, FactionId, GameState } from "@osg/engine";
import { useState } from "react";
import { nameOf } from "../components/game-bits";
import { DecisionBox, FactionChecks, type Run } from "./shared";

const SIGNAL = Object.fromEntries(signalTable.rows.map((r) => [r.id, r]));

/** Step 6 (solo_mode.qmd Part X, 6; Part V, Signals; Part VI, Your Own Secrets). */
export function Signals({ state, decisions, run }: { state: GameState; decisions: Decision[]; run: Run }) {
  const cur = state.current;
  const covert = cur.order.map((id) => cur.actions[id]!).filter((a) => a.source === "player" && a.covert);
  return (
    <div>
      <ul className="signals">
        {Object.entries(cur.signals).map(([aa, s]) => (
          <li key={aa}>
            <strong>{nameOf(state, aa)}</strong>: d6={s.face}, <em>{SIGNAL[s.signal]?.name}</em>
            {SIGNAL[s.signal]?.text && <div className="dim">{SIGNAL[s.signal]!.text}</div>}
          </li>
        ))}
      </ul>

      {decisions.map((d) =>
        d.kind === "exposure" ? (
          <DecisionBox key={`e-${d.aa}`} title={`${nameOf(state, d.aa)} has overextended: does the vulnerability fit one of its Secrets better than a new invention?`}>
            <div className="row">
              <button onClick={() => run({ type: "answerExposure", aa: d.aa, rollSecret: true })}>Yes: roll its Secret Table (it comes out publicly)</button>
              <button onClick={() => run({ type: "answerExposure", aa: d.aa, rollSecret: false })}>No: name a new vulnerability in the Report</button>
            </div>
          </DecisionBox>
        ) : d.kind === "interested" ? (
          <Interested key={`i-${d.action}`} state={state} action={d.action} run={run} />
        ) : null
      )}

      {covert.length > 0 && <h3>Your covert actions</h3>}
      {covert.map((a) => {
        const n = cur.notice[a.id];
        return (
          <p key={a.id}>
            {a.act}:{" "}
            {!n?.checked ? "not checked yet" : !n.noticed ? "not noticed." : n.by ? <strong>noticed by {nameOf(state, n.by)}: its disposition drops by 1, and its next [target] is you.</strong> : "noticed…"}
          </p>
        );
      })}
    </div>
  );
}

function Interested({ state, action, run }: { state: GameState; action: string; run: Run }) {
  const [aas, setAas] = useState<FactionId[]>([]);
  return (
    <DecisionBox title="Your covert action was noticed: which AAs have an interest in it?" note="The engine rolls among them to see which one notices. Choose none if no AA cares.">
      <FactionChecks state={state} options={Object.keys(state.aa)} value={aas} onChange={setAas} />
      <button className="primary" onClick={() => run({ type: "answerInterested", action, aas })}>
        Confirm
      </button>
    </DecisionBox>
  );
}
