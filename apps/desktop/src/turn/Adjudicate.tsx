import { core, inspiration as inspirationTables } from "@osg/rules-data";
import type { ActionClass, ActionId, ConflictGroup, Decision, FactionId, GameState, Visibility } from "@osg/engine";
import { useState } from "react";
import { Field, RuleNote } from "../components/common";
import { nameOf } from "../components/game-bits";
import { ActionCard, DecisionBox, type Run } from "./shared";

const BAND_TEXT = Object.fromEntries(core.results.rows.map((r) => [r.id, `${r.label}: ${r.text}`]));
const OUTCOME_LABEL: Record<string, string> = {
  prevails: "prevails",
  worse: "worse than desired",
  standoff: "standoff",
  "as-rolled": "both can be true: read as rolled"
};

/** Step 5 (solo_mode.qmd Part X, 5; contested_ground.qmd Part IV). */
export function Adjudicate({ state, decisions, run }: { state: GameState; decisions: Decision[]; run: Run }) {
  const cur = state.current;
  const classify = decisions.find((d): d is Extract<Decision, { kind: "classify" }> => d.kind === "classify");
  if (classify) return <ClassifyForm key={classify.actions.join()} state={state} actions={classify.actions} run={run} />;

  const byAction = (id: ActionId) => decisions.filter((d) => "action" in d && d.action === id);
  return (
    <div>
      {cur.groups!.map((g) => (
        <section key={g.id} className={`group group-${g.class}`}>
          <h3>
            {g.class === "conflict" ? "In conflict" : g.class === "opposed" ? "Opposed" : "Unopposed"}
            {g.class === "conflict" && g.bothCanBeTrue !== undefined && (
              <span className="dim"> · {g.bothCanBeTrue ? "both outcomes can be true" : "only one can be true"}</span>
            )}
          </h3>
          {decisions.some((d) => d.kind === "bothCanBeTrue" && d.group === g.id) && <BothCanBeTrue group={g} state={state} run={run} />}
          {g.actions.map((id) => (
            <ActionCard
              key={id}
              state={state}
              action={cur.actions[id]!}
              extra={
                <>
                  <Result state={state} id={id} />
                  {byAction(id).map((d, i) => (
                    <ActionDecision key={`${d.kind}-${i}`} state={state} decision={d} run={run} />
                  ))}
                  {cur.adjudication[id]!.outcome && (
                    <p className="outcome">
                      <strong>Outcome:</strong> {cur.adjudication[id]!.outcome}
                    </p>
                  )}
                </>
              }
            />
          ))}
        </section>
      ))}
    </div>
  );
}

// ---------- classify ----------

function ClassifyForm({ state, actions, run }: { state: GameState; actions: ActionId[]; run: Run }) {
  const cur = state.current;
  // Each action: "unopposed", "opposed", or a conflict letter.
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(actions.map((id) => [id, cur.actions[id]!.source === "hold" ? "unopposed" : cur.actions[id]!.targets.length ? "opposed" : "unopposed"]))
  );
  const letters = ["A", "B", "C"];
  const groups = (): { class: ActionClass; actions: ActionId[] }[] => {
    const out: { class: ActionClass; actions: ActionId[] }[] = [];
    for (const l of letters) {
      const members = actions.filter((id) => choice[id] === l);
      if (members.length) out.push({ class: "conflict", actions: members });
    }
    for (const id of actions) if (choice[id] === "unopposed" || choice[id] === "opposed") out.push({ class: choice[id] as ActionClass, actions: [id] });
    return out;
  };
  const lonelyConflict = letters.some((l) => actions.filter((id) => choice[id] === l).length === 1);
  return (
    <DecisionBox
      title="Which actions are unopposed, opposed, or in conflict?"
      note={
        <RuleNote source="contested_ground.qmd Part IV">
          Unopposed: nothing opposes it and the fiction raises no obstacle; the desired outcome occurs, no roll. Opposed: something stands in its way; grade and
          roll. In conflict: two or more actions directly oppose each other; each is graded and rolled, and the higher kept die prevails.
        </RuleNote>
      }
    >
      {actions.map((id) => {
        const a = cur.actions[id]!;
        return (
          <div key={id} className="classify-row">
            <ActionCard state={state} action={a} />
            <select
              aria-label={`Class of ${nameOf(state, a.faction)}'s action`}
              value={choice[id]}
              disabled={a.source === "hold"}
              onChange={(e) => setChoice({ ...choice, [id]: e.target.value })}
            >
              <option value="unopposed">Unopposed</option>
              <option value="opposed">Opposed</option>
              {letters.map((l) => (
                <option key={l} value={l}>
                  In conflict ({l})
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {lonelyConflict && <p className="warn-text">A conflict needs two or more actions with the same letter.</p>}
      <button className="primary" disabled={lonelyConflict} onClick={() => run({ type: "classify", groups: groups() })}>
        Confirm the classes
      </button>
    </DecisionBox>
  );
}

function BothCanBeTrue({ group, state, run }: { group: ConflictGroup; state: GameState; run: Run }) {
  const who = group.actions.map((id) => nameOf(state, state.current.actions[id]!.faction)).join(" and ");
  return (
    <DecisionBox title={`Can both outcomes be true at once (${who})?`}>
      <p className="dim">If yes, both occur as rolled. If not, the higher kept die prevails and the other is worse than desired; a tie is a standoff.</p>
      <div className="row">
        <button onClick={() => run({ type: "judgeConflict", group: group.id, bothCanBeTrue: true })}>Yes, both can be true</button>
        <button onClick={() => run({ type: "judgeConflict", group: group.id, bothCanBeTrue: false })}>No, only one</button>
      </div>
    </DecisionBox>
  );
}

// ---------- results ----------

function Result({ state, id }: { state: GameState; id: ActionId }) {
  const a = state.current.adjudication[id]!;
  if (!a.band && !a.grade) return null;
  return (
    <div className="result">
      {a.grade && (
        <span className="badge">
          {a.grade === "strong" ? "Strong" : "Weak"}
          {a.gradeSource === "oracle" ? " (Oracle)" : ""}
        </span>
      )}
      {a.rolled && (
        <span className="dice" aria-label={`Dice ${a.rolled.roll.faces.join(" and ")}, kept ${a.rolled.kept}`}>
          2d6 [{a.rolled.roll.faces.join(", ")}] keep {a.rolled.keep === "high" ? "higher" : "lower"} = <strong>{a.rolled.kept}</strong>
          {a.rolled.effective !== a.rolled.kept && <> → counts as {a.rolled.effective}</>}
          {a.rolled.bonusEffect && <span className="dim"> (bonus: {a.rolled.bonusEffect})</span>}
          {a.rolled.doubles && <span className="badge">doubles</span>}
        </span>
      )}
      {a.band && (
        <p className={`band band-${a.band}`}>
          {!a.rolled && "Unopposed: "}
          {a.conflictOutcome && <strong>{OUTCOME_LABEL[a.conflictOutcome]}. </strong>}
          {BAND_TEXT[a.band]}
        </p>
      )}
      {a.inspiration?.use && a.inspiration.face && (
        <p className="inspiration">
          {a.inspiration.table === "especiallyGood" ? "Especially good" : "Especially bad"} d6={a.inspiration.face}:{" "}
          {inspirationText(a.inspiration.table!, a.inspiration.face)}
        </p>
      )}
      {a.forceOfNature?.face && <p className="inspiration">Force of Nature d6={a.forceOfNature.face}</p>}
    </div>
  );
}

function inspirationText(table: "especiallyGood" | "especiallyBad", face: number): string {
  return inspirationTables[table].rows[face - 1]?.text ?? "";
}

// ---------- per-action decisions ----------

function ActionDecision({ state, decision: d, run }: { state: GameState; decision: Decision; run: Run }) {
  switch (d.kind) {
    case "grade":
      return <GradeForm state={state} decision={d} run={run} />;
    case "forceOfNature":
      return (
        <DecisionBox title="Doubles: introduce a Force of Nature?" note={`Used ${state.forceOfNatureUsed} of 2 this game. Use one only when a good one is available: unpredictable but traceable, creating problems for everyone.`}>
          <div className="row">
            <button onClick={() => run({ type: "answerForceOfNature", action: d.action, use: true })}>Roll the source</button>
            <button onClick={() => run({ type: "answerForceOfNature", action: d.action, use: false })}>No</button>
          </div>
        </DecisionBox>
      );
    case "inspiration":
      return (
        <DecisionBox title={d.table === "especiallyGood" ? "A 6: does something especially good also occur?" : "A 1: does something especially bad also occur?"}>
          <div className="row">
            <button onClick={() => run({ type: "answerInspiration", action: d.action, use: true })}>Roll the Inspiration Table</button>
            <button onClick={() => run({ type: "answerInspiration", action: d.action, use: false })}>No</button>
          </div>
        </DecisionBox>
      );
    case "inspirationTarget":
      return (
        <DecisionBox title="Which faction does it affect?">
          <div className="row wrap">
            {d.candidates.map((c) => (
              <button key={c} onClick={() => run({ type: "chooseInspirationTarget", action: d.action, target: c })}>
                {nameOf(state, c)}
              </button>
            ))}
            {d.candidates.length === 0 && <button onClick={() => run({ type: "chooseInspirationTarget", action: d.action })}>None applies</button>}
          </div>
        </DecisionBox>
      );
    case "clockEffect":
      return (
        <DecisionBox
          title={
            d.question === "addresses"
              ? "Does this action's Outcome address the Problem itself, not a rival?"
              : d.question === "worsens"
                ? "Does the especially bad result make the Problem worse?"
                : "Does the Force of Nature make the Problem worse?"
          }
          note={d.question === "addresses" ? "If yes, the Crisis Clock goes back one box." : "If yes, the Crisis Clock advances one more box."}
        >
          <div className="row">
            <button onClick={() => run({ type: "answerClockEffect", action: d.action, question: d.question, yes: true })}>Yes</button>
            <button onClick={() => run({ type: "answerClockEffect", action: d.action, question: d.question, yes: false })}>No</button>
          </div>
        </DecisionBox>
      );
    case "investigationSix":
      return <InvestigationSix state={state} action={d.action} run={run} />;
    case "revealToAA":
      return <RevealToAA state={state} action={d.action} aa={d.aa} run={run} />;
    case "writeOutcome":
      return <OutcomeForm key={d.action} state={state} action={d.action} run={run} />;
    default:
      return null;
  }
}

function GradeForm({ state, decision: d, run }: { state: GameState; decision: Extract<Decision, { kind: "grade" }>; run: Run }) {
  const [inScope, setInScope] = useState(false);
  const a = state.current.actions[d.action]!;
  const bonus = state.factions[a.faction]!.bonuses.find((b) => b.usesLeft > 0);
  const scope = d.askBonusScope ? { bonusInScope: inScope } : {};
  return (
    <DecisionBox
      title="Grade the leverage"
      note={
        <RuleNote source="solo_mode.qmd Part III, Grading Leverage">
          Before calling any faction's leverage Strong: is the resource or relationship explicitly established in prior fiction? Has a prior action created the
          conditions for this one? Would a neutral reader of the Report agree this faction has the advantage? All three yes: Strong. Any clear no: Weak. If you
          genuinely can't tell, ask the Oracle at Even. Apply the same checklist to every AA, above all to one acting against you.
        </RuleNote>
      }
    >
      {a.citedFacts.length > 0 && (
        <ul className="cited">
          {a.citedFacts.map((f) => (
            <li key={f}>{state.facts[f]?.text}</li>
          ))}
        </ul>
      )}
      {d.askBonusScope && bonus && (
        <label className="check">
          <input type="checkbox" checked={inScope} onChange={(e) => setInScope(e.target.checked)} /> The action is within the scope of {bonus.name} (it spends it if
          Weak or in a conflict)
        </label>
      )}
      <div className="row">
        <button onClick={() => run({ type: "grade", action: d.action, grade: "strong", ...scope })}>Strong</button>
        <button onClick={() => run({ type: "grade", action: d.action, grade: "weak", ...scope })}>Weak</button>
        <button onClick={() => run({ type: "gradeByOracle", action: d.action, ...scope })}>Ask the Oracle (Even)</button>
      </div>
    </DecisionBox>
  );
}

function InvestigationSix({ state, action, run }: { state: GameState; action: ActionId; run: Run }) {
  const [crumbOn, setCrumbOn] = useState("");
  const others = state.standing.filter((f) => f !== state.current.actions[action]!.faction);
  return (
    <DecisionBox title="A 6 on an investigation: roll twice and keep both, or keep one and gain a crumb on another faction?">
      <div className="row">
        <button onClick={() => run({ type: "answerInvestigationSix", action, keep: "both" })}>Keep both secrets</button>
        <select aria-label="Crumb on" value={crumbOn} onChange={(e) => setCrumbOn(e.target.value)}>
          <option value="">Crumb on…</option>
          {others.map((f) => (
            <option key={f} value={f}>
              {nameOf(state, f)}
            </option>
          ))}
        </select>
        <button disabled={!crumbOn} onClick={() => run({ type: "answerInvestigationSix", action, keep: "one-and-crumb", crumbOn })}>
          One secret and a crumb
        </button>
      </div>
    </DecisionBox>
  );
}

function RevealToAA({ state, action, aa, run }: { state: GameState; action: ActionId; aa: FactionId; run: Run }) {
  const mine = Object.values(state.facts).filter((f) => f.visibility.kind === "private" && f.visibility.faction === state.player && !f.knownBy.includes(aa));
  return (
    <DecisionBox title={`${nameOf(state, aa)}'s investigation of you succeeded: what does it learn?`} note="One of your private Position facts or a past covert action, your choice. It may use it as leverage from now on.">
      <ul className="choose-list">
        {mine.map((f) => (
          <li key={f.id}>
            <button onClick={() => run({ type: "revealToAA", action, fact: f.id })}>{f.text}</button>
          </li>
        ))}
      </ul>
    </DecisionBox>
  );
}

interface NewFactRow {
  text: string;
  visibility: "public" | "player" | "actor";
  rumor: boolean;
}

function OutcomeForm({ state, action, run }: { state: GameState; action: ActionId; run: Run }) {
  const a = state.current.actions[action]!;
  const [text, setText] = useState("");
  const [friction, setFriction] = useState("");
  const [facts, setFacts] = useState<NewFactRow[]>([]);
  const visibility = (v: NewFactRow["visibility"]): Visibility =>
    v === "public" ? { kind: "public" } : { kind: "private", faction: v === "player" ? state.player : a.faction };
  const submit = () =>
    run({
      type: "writeOutcome",
      action,
      text,
      ...(friction.trim() ? { friction } : {}),
      facts: facts
        .filter((f) => f.text.trim())
        .map((f) => ({ text: f.text, visibility: visibility(f.visibility), tags: { factions: [...new Set([a.faction, ...a.targets])] }, status: f.rumor ? "rumor" : "established" }))
    });
  return (
    <DecisionBox
      title="Write the outcome"
      note={
        <RuleNote source="RAT; No Action Without Friction">
          Reasonable (proportionate), Actionable (it leaves a hook), Traceable (earlier fiction led here). Every outcome leaves a mark: ask who notices, what it
          costs, what it opens up. Complicate; do not block.
        </RuleNote>
      }
    >
      <Field label="What happens, as fact">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      </Field>
      <Field label="Friction: the mark it leaves">
        <input value={friction} onChange={(e) => setFriction(e.target.value)} />
      </Field>
      <span className="field-label">New established facts (what later actions can cite)</span>
      {facts.map((f, i) => (
        <div key={i} className="obligation">
          <input value={f.text} onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <select
            value={f.visibility}
            onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, visibility: e.target.value as NewFactRow["visibility"] } : x)))}
          >
            <option value="public">public</option>
            <option value="player">private to you</option>
            {a.faction !== state.player && <option value="actor">private to {nameOf(state, a.faction)}</option>}
          </select>
          <label className="check">
            <input type="checkbox" checked={f.rumor} onChange={(e) => setFacts(facts.map((x, j) => (j === i ? { ...x, rumor: e.target.checked } : x)))} /> rumor
          </label>
        </div>
      ))}
      <div className="actions-row">
        <button className="link" onClick={() => setFacts([...facts, { text: "", visibility: a.covert ? "player" : "public", rumor: false }])}>
          + fact
        </button>
      </div>
      <button className="primary" disabled={!text.trim()} onClick={submit}>
        Accept the outcome
      </button>
    </DecisionBox>
  );
}
