import type { FactionId, GameState } from "@osg/engine";
import { useState } from "react";
import { Field, RuleNote } from "../components/common";
import { nameOf } from "../components/game-bits";
import { DealsInForce } from "./Talk";
import { ActionCard, AolFields, DecisionBox, FactPicker, FactionChecks, aolFilled, type AolValue, type Run } from "./shared";

/** Step 3 (solo_mode.qmd Part X, 3): write the player's action in full. From here on it does not change. */
export function Declare({ state, run }: { state: GameState; run: Run }) {
  const mine = state.current.order.map((id) => state.current.actions[id]!).find((a) => a.source === "player");
  if (mine) {
    return (
      <>
        <p className="dim">Your action is declared and fixed.</p>
        <ActionCard state={state} action={mine} />
      </>
    );
  }
  return (
    <>
      <DeclareForm state={state} run={run} />
      <DealsInForce state={state} run={run} />
    </>
  );
}

function DeclareForm({ state, run }: { state: GameState; run: Run }) {
  const me = state.factions[state.player]!;
  const others = state.standing.filter((f) => f !== state.player);
  const jointPartners = Object.values(state.deals)
    .filter((d) => d.status === "active" && d.joint && d.parties.includes(state.player))
    .flatMap((d) => d.parties.filter((p) => p !== state.player && state.aa[p]));
  const [aol, setAol] = useState<AolValue>({ act: "", out: "", lev: "" });
  const [bonus, setBonus] = useState("");
  const [targets, setTargets] = useState<FactionId[]>([]);
  const [investigates, setInvestigates] = useState("");
  const [covert, setCovert] = useState(false);
  const [joint, setJoint] = useState<FactionId[]>([]);
  const [cited, setCited] = useState<string[]>([]);

  const submit = () =>
    run({
      type: "declareAction",
      action: {
        ...aol,
        ...(bonus ? { bonus } : {}),
        targets,
        ...(investigates ? { investigates } : {}),
        covert,
        ...(joint.length ? { joint } : {}),
        citedFacts: cited
      }
    });

  return (
    <DecisionBox
      title={`${me.name}: declare your action`}
      note={
        <RuleNote source="Part X, 3">
          Write your action in full: Action / Outcome / Leverage. Declare any bonus you spend. From here on, it does not change. One action per turn.
        </RuleNote>
      }
    >
      <p className="dim">
        Your objectives: {me.objectives.shortTerm}
        {me.objectives.longTerm ? ` / ${me.objectives.longTerm}` : ""}
      </p>
      <AolFields value={aol} onChange={setAol} />
      <FactPicker state={state} faction={state.player} value={cited} onChange={setCited} />
      <div className="row">
        <Field label="Spend a bonus">
          <select value={bonus} onChange={(e) => setBonus(e.target.value)}>
            <option value="">No bonus</option>
            {me.bonuses
              .filter((b) => b.usesLeft > 0)
              .map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} ({b.usesLeft} left)
                </option>
              ))}
          </select>
        </Field>
        <Field label="Investigates (rolls its Secret Table on a success)">
          <select value={investigates} onChange={(e) => setInvestigates(e.target.value)}>
            <option value="">Nobody</option>
            {Object.keys(state.aa).map((id) => (
              <option key={id} value={id}>
                {nameOf(state, id)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Aimed at">
        <FactionChecks state={state} options={others} value={targets} onChange={setTargets} />
      </Field>
      {jointPartners.length > 0 && (
        <Field label="A joint action with (each confirms at step 4)">
          <FactionChecks state={state} options={jointPartners} value={joint} onChange={setJoint} />
        </Field>
      )}
      <label className="check">
        <input type="checkbox" checked={covert} onChange={(e) => setCovert(e.target.checked)} /> Covert: the outcome is private; a crumb goes in the Report, and
        at step 6 the Oracle says whether it is noticed
      </label>
      <div className="actions-row">
        <button className="primary" disabled={!aolFilled(aol)} onClick={submit}>
          Declare and lock
        </button>
      </div>
    </DecisionBox>
  );
}
