import { behaviorRules } from "@osg/rules-data";
import type { Decision, FactionId, GameState } from "@osg/engine";
import { useState } from "react";
import { Field, RuleNote } from "../components/common";
import { DispositionBadge, nameOf } from "../components/game-bits";
import { ActionCard, AolFields, DecisionBox, FactPicker, FactionChecks, aolFilled, type AolValue, type Run } from "./shared";

const ruleText = (behavior: string) => behaviorRules.rows.find((r) => r.id === behavior)?.rule ?? "";

/** Step 4 (solo_mode.qmd Part X, 4): for each AA, in order: deal obligation, hold rule, table roll. */
export function AAActions({ state, decisions, run }: { state: GameState; decisions: Decision[]; run: Run }) {
  return (
    <div>
      {decisions.map((d) => (
        <AADecision key={`${d.kind}-${"aa" in d ? d.aa : ""}`} state={state} decision={d} run={run} />
      ))}
      <h3>Actions this turn</h3>
      {state.current.order.map((id) => (
        <ActionCard key={id} state={state} action={state.current.actions[id]!} />
      ))}
      {Object.entries(state.current.aa)
        .filter(([, t]) => t.joint === "joined")
        .map(([aa]) => (
          <p key={aa} className="dim">
            {nameOf(state, aa)} confirmed the joint action: it spends its action on yours.
          </p>
        ))}
    </div>
  );
}

function AAHeader({ state, aa }: { state: GameState; aa: FactionId }) {
  const s = state.aa[aa]!;
  return (
    <div className="aa-header">
      <strong>{nameOf(state, aa)}</strong> <DispositionBadge value={s.disposition} /> <span className="badge">{s.behavior}</span>
      <div className="dim">Wants: {s.objective}</div>
      <div className="dim">Rule: {ruleText(s.behavior)}</div>
    </div>
  );
}

function AADecision({ state, decision: d, run }: { state: GameState; decision: Decision; run: Run }) {
  switch (d.kind) {
    case "dealKeepCost": {
      const deal = state.deals[d.deal]!;
      return (
        <DecisionBox title={`${nameOf(state, d.aa)}: does keeping the deal cost it something real this turn?`} note={<AAHeader state={state} aa={d.aa} />}>
          <p>{deal.terms}</p>
          <p className="dim">If yes, the Oracle asks whether it keeps the deal, with odds from its disposition.</p>
          <div className="row">
            <button onClick={() => run({ type: "answerDealCost", aa: d.aa, deal: d.deal, costs: true })}>Yes, it costs something</button>
            <button onClick={() => run({ type: "answerDealCost", aa: d.aa, deal: d.deal, costs: false })}>No</button>
          </div>
        </DecisionBox>
      );
    }
    case "consolidatorThreat":
      return (
        <DecisionBox title={`${nameOf(state, d.aa)}: did a faction threaten it in the last Report?`} note={<AAHeader state={state} aa={d.aa} />}>
          <p className="dim">A Consolidator acts against another faction only if that faction threatened it. With nothing to defend, it holds.</p>
          <div className="row">
            <button onClick={() => run({ type: "answerThreat", aa: d.aa, threatened: true })}>Yes, it has something to defend</button>
            <button onClick={() => run({ type: "answerThreat", aa: d.aa, threatened: false })}>No, it holds</button>
          </div>
        </DecisionBox>
      );
    case "targetChoice":
      return <TargetChoice state={state} decision={d} run={run} />;
    case "writeAAAction":
      return <WriteAAAction key={`${d.aa}-${d.entry ?? d.source}`} state={state} decision={d} run={run} />;
    default:
      return null;
  }
}

function TargetChoice({ state, decision: d, run }: { state: GameState; decision: Extract<Decision, { kind: "targetChoice" }>; run: Run }) {
  const entry = state.current.aa[d.aa]?.table?.entry ?? "";
  return (
    <DecisionBox title={`${nameOf(state, d.aa)}: who is [target]?`} note={<AAHeader state={state} aa={d.aa} />}>
      <p>
        Rolled: <em>{entry}</em>
      </p>
      <p className="dim">
        The faction most in the way of its objective.
        {d.prefer && ` Between equal candidates it picks ${nameOf(state, d.prefer)} (Wary toward you).`}
        {d.avoid && ` Between equal candidates it doesn't pick ${nameOf(state, d.avoid)} (Open toward you).`}
      </p>
      <div className="row wrap">
        {d.candidates.map((c) => (
          <button key={c} onClick={() => run({ type: "chooseTarget", aa: d.aa, target: c })}>
            {nameOf(state, c)}
          </button>
        ))}
      </div>
    </DecisionBox>
  );
}

const SOURCE_NOTE: Record<string, string> = {
  table: "Expand the rolled entry into a full action, written as a competent player of this faction would: play every AA to win.",
  obligation: "Its deal requires it to act this turn: that is its action, instead of the table.",
  exploit: "It broke a deal this turn: its action exploits the break.",
  rule: "The entry was vetoed twice: write an action from its behavior rule directly."
};

function WriteAAAction({ state, decision: d, run }: { state: GameState; decision: Extract<Decision, { kind: "writeAAAction" }>; run: Run }) {
  const t = state.current.aa[d.aa];
  const [aol, setAol] = useState<AolValue>({ act: d.entry?.replace("[target]", nameOf(state, d.target)) ?? d.obligation?.description ?? "", out: "", lev: "" });
  const [targets, setTargets] = useState<FactionId[]>([]);
  const [investigates, setInvestigates] = useState("");
  const [cited, setCited] = useState<string[]>([]);
  const others = state.standing.filter((f) => f !== d.aa && f !== d.target);
  const deal = d.deal ? state.deals[d.deal] : undefined;
  return (
    <DecisionBox title={`${nameOf(state, d.aa)}: write its action`} note={<AAHeader state={state} aa={d.aa} />}>
      <p className="dim">{SOURCE_NOTE[d.source]}</p>
      {d.entry && (
        <p>
          Table roll {t ? `(${t.table!.index + 1})` : ""}: <em>{d.entry}</em>
          {d.target && (
            <>
              {" "}
              → [target] = <strong>{nameOf(state, d.target)}</strong>
            </>
          )}
        </p>
      )}
      {deal && <p>Deal: {deal.terms}</p>}
      <AolFields value={aol} onChange={setAol} />
      <FactPicker state={state} faction={d.aa} value={cited} onChange={setCited} />
      <div className="row">
        <Field label="Also aimed at">
          <FactionChecks state={state} options={others} value={targets} onChange={setTargets} />
        </Field>
        <Field label="Investigates">
          <select value={investigates} onChange={(e) => setInvestigates(e.target.value)}>
            <option value="">Nobody</option>
            {state.standing
              .filter((f) => f !== d.aa)
              .map((f) => (
                <option key={f} value={f}>
                  {nameOf(state, f)}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="actions-row">
        <button
          className="primary"
          disabled={!aolFilled(aol)}
          onClick={() =>
            run({ type: "writeAAAction", aa: d.aa, action: { ...aol, targets, ...(investigates ? { investigates } : {}), citedFacts: cited } })
          }
        >
          Accept this action
        </button>
        {d.source === "table" && (
          <>
            <button onClick={() => run({ type: "vetoEntry", aa: d.aa, reason: "veto" })} title="The entry makes no sense in the current fiction, or breaks its behavior rule">
              Veto (reroll{t && t.vetoes > 0 ? "; next veto: write from the rule" : " once"})
            </button>
            <button onClick={() => run({ type: "vetoEntry", aa: d.aa, reason: "deal" })} title="The entry would break a deal it must refrain from breaking">
              Breaks a deal: reroll
            </button>
          </>
        )}
      </div>
      <RuleNote source="Part IV, Veto">
        If the rolled entry makes no sense in the current fiction or breaks the AA's behavior rule, reroll once. If the reroll fails too, write an action from the
        behavior rule directly. Entries that break a deal it must keep are rerolled without counting as a veto.
      </RuleNote>
    </DecisionBox>
  );
}
