import type { Decision, FactionId, GameState } from "@osg/engine";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { Field, RuleNote } from "../components/common";
import { DispositionBadge, nameOf } from "../components/game-bits";
import { DecisionBox, type Run } from "./shared";

const TRIGGER: Record<string, string> = {
  "kept-6-or-1": "its kept die was a 6 or a 1",
  "objective-achieved": "its objective was achieved",
  "objective-impossible": "its objective became impossible"
};

/** Step 7 (solo_mode.qmd Part X, 7): disposition, deals, adaptation, Clock, Standing. */
export function Update({ state, decisions, run }: { state: GameState; decisions: Decision[]; run: Run }) {
  const landed = state.clock.escalations.filter((e) => e.landed);
  return (
    <div>
      <p className="dim">
        The Crisis Clock has advanced: {state.clock.position}/{state.clock.length}.
      </p>
      {landed.map((e) => (
        <p key={e.box} className="escalation-landed">
          <strong>{e.title}.</strong> {e.text}
        </p>
      ))}
      {decisions.map((d) =>
        d.kind === "dispositionCauses" ? (
          <DispositionForm key={`d-${d.aa}`} state={state} aa={d.aa} run={run} />
        ) : d.kind === "adaptation" ? (
          <AdaptationForm key={`a-${d.aa}-${d.trigger}`} state={state} aa={d.aa} trigger={d.trigger} run={run} />
        ) : d.kind === "standing" ? (
          <StandingForm key="standing" state={state} proposal={d.proposal} run={run} />
        ) : null
      )}
      <ObjectiveChange state={state} run={run} />
    </div>
  );
}

function DispositionForm({ state, aa, run }: { state: GameState; aa: FactionId; run: Run }) {
  const [kept, setKept] = useState(false);
  const [harmed, setHarmed] = useState(false);
  const noticed = (state.current.causes[aa] ?? []).includes("uncovered-covert");
  const broke = Object.values(state.deals).some((d) => d.parties.includes(aa) && d.brokenBy === state.player && d.brokenTurn === state.turn);
  return (
    <DecisionBox
      title={
        <>
          {nameOf(state, aa)}'s disposition toward you <DispositionBadge value={state.aa[aa]!.disposition} />
        </>
      }
      note={<RuleNote source="Part V, Moving disposition">Each cause applies once per turn. Disposition never moves past Hostile or Allied.</RuleNote>}
    >
      <label className="check">
        <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} /> +1: you kept a deal with it, or your action clearly benefited it
      </label>
      <label className="check">
        <input type="checkbox" checked={harmed} onChange={(e) => setHarmed(e.target.checked)} disabled={noticed} /> −1: your action harmed it, even as a side
        effect{noticed && " (already counted: it uncovered your covert action)"}
      </label>
      {broke && <p className="warn-text">−2: you broke a deal with it this turn (applied automatically).</p>}
      <button className="primary" onClick={() => run({ type: "answerDisposition", aa, keptDealOrBenefited: kept, harmed })}>
        Apply
      </button>
    </DecisionBox>
  );
}

function AdaptationForm({ state, aa, trigger, run }: { state: GameState; aa: FactionId; trigger: string; run: Run }) {
  const table = state.aa[aa]!.actionTable;
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  return (
    <DecisionBox title={`${nameOf(state, aa)} adapts: ${TRIGGER[trigger] ?? trigger}`} note="Rewrite one entry of its Action Table, replacing the entry least relevant to the current fiction.">
      <ol className="table-entries">
        {table.map((e, i) => (
          <li key={i}>
            <label className="check">
              <input type="radio" name={`adapt-${aa}`} checked={index === i} onChange={() => setIndex(i)} /> {e}
            </label>
          </li>
        ))}
      </ol>
      <Field label="New entry (a verb and an object; [target] if it moves against someone)">
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <button className="primary" disabled={!text.trim()} onClick={() => run({ type: "rewriteEntry", aa, index, text, trigger })}>
        Rewrite entry {index + 1}
      </button>
    </DecisionBox>
  );
}

function StandingForm({ state, proposal, run }: { state: GameState; proposal: FactionId[]; run: Run }) {
  const [order, setOrder] = useState(proposal);
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setOrder(next);
  };
  return (
    <DecisionBox
      title="Standing: who looks strong, who looks exposed?"
      note={
        <RuleNote source="Part IV, Standing">
          Revise it from the Report: who gained visible power, who lost it, who overreached. Judge by what a rival could see, not by what you privately know.
          The proposal already includes this turn's Inspiration moves.
        </RuleNote>
      }
    >
      <ol className="standing-edit">
        {order.map((id, i) => (
          <li key={id}>
            <span>{nameOf(state, id)}</span>
            <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${nameOf(state, id)} up`}>
              <ArrowUp size={14} />
            </button>
            <button className="icon" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${nameOf(state, id)} down`}>
              <ArrowDown size={14} />
            </button>
          </li>
        ))}
      </ol>
      <button className="primary" onClick={() => run({ type: "setStanding", order })}>
        Set Standing
      </button>
    </DecisionBox>
  );
}

/** Optional: an AA's objective was achieved or became impossible (Part IV, Adaptation). */
function ObjectiveChange({ state, run }: { state: GameState; run: Run }) {
  const [aa, setAa] = useState("");
  const [objective, setObjective] = useState("");
  return (
    <details className="optional">
      <summary>An AA's objective was achieved, or became impossible</summary>
      <div className="row">
        <Field label="AA">
          <select value={aa} onChange={(e) => setAa(e.target.value)}>
            <option value="">Choose…</option>
            {Object.keys(state.aa).map((id) => (
              <option key={id} value={id}>
                {nameOf(state, id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Its new objective">
          <input value={objective} onChange={(e) => setObjective(e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <button disabled={!aa || !objective.trim()} onClick={() => run({ type: "changeObjective", aa, objective, reason: "achieved" })}>
          Achieved: the next step its leverage makes possible
        </button>
        <button disabled={!aa || !objective.trim()} onClick={() => run({ type: "changeObjective", aa, objective, reason: "impossible" })}>
          Impossible: new objective and a new behavior rule
        </button>
      </div>
    </details>
  );
}
