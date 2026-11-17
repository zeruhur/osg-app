import { rules, type Decision, type DealTerms, type FactionId, type GameState, type Obligation } from "@osg/engine";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { ConfirmModal, Field, RuleNote } from "../components/common";
import { DispositionBadge, nameOf } from "../components/game-bits";
import { DecisionBox, type Run } from "./shared";

const ODDS_LABEL: Record<string, string> = { refused: "Refused", unlikely: "Unlikely", even: "Even", likely: "Likely", accepted: "Accepted" };
const ANSWER_LABEL: Record<string, string> = {
  "yes-and": "Yes, and…",
  yes: "Yes",
  "yes-but": "Yes, but…",
  "no-but": "No, but…",
  no: "No",
  "no-and": "No, and…"
};

/** Step 2 (solo_mode.qmd Part X, 2; Part V): answer AA Offers; make up to one Offer to each AA. */
export function Talk({ state, decisions, run }: { state: GameState; decisions: Decision[]; run: Run }) {
  const offers = Object.values(state.current.offers);
  const offered = new Set(offers.map((o) => o.aa));
  const free = Object.keys(state.aa).filter((aa) => !offered.has(aa));
  return (
    <div>
      {decisions.map((d) =>
        d.kind === "signalOffer" ? (
          <SignalOfferForm key={`s-${d.aa}`} state={state} aa={d.aa} run={run} />
        ) : d.kind === "settleOffer" ? (
          <SettleOfferForm key={`o-${d.offer}`} state={state} decision={d} run={run} />
        ) : null
      )}

      {offers.length > 0 && (
        <section className="decision">
          <h3>Offers this turn</h3>
          <ul className="offers">
            {offers.map((o) => (
              <li key={o.id}>
                <strong>{nameOf(state, o.aa)}</strong>: {o.terms.text}
                <div className="dim">
                  Odds {ODDS_LABEL[o.odds]}
                  {o.answer && <> · the Oracle says {ANSWER_LABEL[o.answer]}</>}
                  {o.settled && (o.deal ? " · deal struck" : " · no deal")}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {free.length > 0 && <OfferForm key={free.join()} state={state} aas={free} run={run} />}
      <DealsInForce state={state} run={run} />
    </div>
  );
}

function OfferForm({ state, aas, run }: { state: GameState; aas: FactionId[]; run: Run }) {
  const [aa, setAa] = useState(aas[0]!);
  const [text, setText] = useState("");
  const [mine, setMine] = useState<Obligation[]>([]);
  const [theirs, setTheirs] = useState<Obligation[]>([]);
  const [until, setUntil] = useState("");
  const [joint, setJoint] = useState(false);
  const [advances, setAdvances] = useState(false);
  const [costs, setCosts] = useState(false);
  const target = state.aa[aa]!;
  const preview = rules.offerOdds(target.disposition, { advancesObjective: advances, costsProtectedOrHelpsRival: costs });

  const submit = async () => {
    const terms: DealTerms = {
      text,
      obligations: { [state.player]: mine.filter((o) => o.description.trim()), [aa]: theirs.filter((o) => o.description.trim()) },
      ...(until ? { until: Number(until) } : {}),
      ...(joint ? { joint: true } : {})
    };
    if (await run({ type: "makeOffer", aa, terms, fit: { advancesObjective: advances, costsProtectedOrHelpsRival: costs } })) {
      setText("");
      setMine([]);
      setTheirs([]);
    }
  };

  return (
    <DecisionBox
      title="Make an Offer (optional)"
      note={
        <RuleNote source="Part V, Making an Offer">
          State the deal: what you give and what you ask. The odds start at Even and shift one step for each reason; past Likely it accepts
          without rolling, past Unlikely it refuses. Hostile refuses unless the deal serves its objective (then Unlikely).
        </RuleNote>
      }
    >
      <Field label="To">
        <select value={aa} onChange={(e) => setAa(e.target.value)}>
          {aas.map((id) => (
            <option key={id} value={id}>
              {nameOf(state, id)} ({state.aa[id]!.disposition})
            </option>
          ))}
        </select>
      </Field>
      <p className="dim">
        {nameOf(state, aa)} wants: {target.objective} <DispositionBadge value={target.disposition} />
      </p>
      <Field label="The deal">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="You give … ; they give …" />
      </Field>
      <div className="row">
        <ObligationsEditor label={`${nameOf(state, state.player)} (you) will`} turn={state.turn} value={mine} onChange={setMine} />
        <ObligationsEditor label={`${nameOf(state, aa)} will`} turn={state.turn} value={theirs} onChange={setTheirs} />
      </div>
      <div className="row">
        <Field label="Runs until the end of turn (optional)">
          <input type="number" min={state.turn} max={state.turns} value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={joint} onChange={(e) => setJoint(e.target.checked)} /> A joint action: {nameOf(state, aa)} joins yours
        </label>
      </div>
      <fieldset className="fit">
        <legend>Your judgment</legend>
        <label className="check">
          <input type="checkbox" checked={advances} onChange={(e) => setAdvances(e.target.checked)} /> The deal clearly advances its objective
        </label>
        <label className="check">
          <input type="checkbox" checked={costs} onChange={(e) => setCosts(e.target.checked)} /> It costs something its behavior rule protects, or helps its
          rival
        </label>
      </fieldset>
      <p className="odds-preview">
        Odds: <strong>{ODDS_LABEL[preview.odds]}</strong> <span className="dim">({preview.steps.join("; ")})</span>
      </p>
      <button className="primary" disabled={!text.trim()} onClick={submit}>
        Make the Offer
      </button>
    </DecisionBox>
  );
}

function ObligationsEditor(props: { label: string; turn: number; value: Obligation[]; onChange: (v: Obligation[]) => void }) {
  const set = (i: number, o: Obligation) => props.onChange(props.value.map((x, j) => (j === i ? o : x)));
  return (
    <div className="obligations">
      <span className="field-label">{props.label}</span>
      {props.value.map((o, i) => (
        <div key={i} className="obligation">
          <select value={o.kind} onChange={(e) => set(i, { ...o, kind: e.target.value as Obligation["kind"] })}>
            <option value="act">act:</option>
            <option value="refrain">refrain from / keep:</option>
          </select>
          <input value={o.description} onChange={(e) => set(i, { ...o, description: e.target.value })} />
          <label className="check" title="Only this turn">
            <input type="checkbox" checked={o.turn !== undefined} onChange={(e) => set(i, { ...o, turn: e.target.checked ? props.turn : undefined })} /> this turn only
          </label>
          <button className="icon" onClick={() => props.onChange(props.value.filter((_, j) => j !== i))} aria-label="Remove">
            <X size={14} />
          </button>
        </div>
      ))}
      <button className="link" onClick={() => props.onChange([...props.value, { kind: "act", description: "" }])}>
        <Plus size={12} /> obligation
      </button>
    </div>
  );
}

function SettleOfferForm({ state, decision, run }: { state: GameState; decision: Extract<Decision, { kind: "settleOffer" }>; run: Run }) {
  const offer = state.current.offers[decision.offer]!;
  const [condition, setCondition] = useState("");
  const [counter, setCounter] = useState("");
  const who = nameOf(state, offer.aa);
  const title = `${who} answers: ${ANSWER_LABEL[offer.answer ?? ""] ?? ""}`;
  switch (decision.followUp) {
    case "accept-and-add":
      return (
        <DecisionBox title={title} note={`${who} accepts, and adds something. Choose what.`}>
          <div className="row">
            <button onClick={() => run({ type: "settleOffer", offer: offer.id, addition: "information" })}>Information</button>
            <button onClick={() => run({ type: "settleOffer", offer: offer.id, addition: "help" })}>Extra help</button>
            <button onClick={() => run({ type: "settleOffer", offer: offer.id, addition: "disposition" })}>+1 disposition</button>
          </div>
        </DecisionBox>
      );
    case "accept-on-condition":
      return (
        <DecisionBox title={title} note={`${who} accepts on one added condition. Take it or walk away.`}>
          <Field label="The condition">
            <textarea value={condition} onChange={(e) => setCondition(e.target.value)} rows={2} />
          </Field>
          <div className="row">
            <button className="primary" disabled={!condition.trim()} onClick={() => run({ type: "settleOffer", offer: offer.id, condition, takeCondition: true })}>
              Take it
            </button>
            <button disabled={!condition.trim()} onClick={() => run({ type: "settleOffer", offer: offer.id, condition, takeCondition: false })}>
              Walk away
            </button>
          </div>
        </DecisionBox>
      );
    case "refuse-with-counter":
      return (
        <DecisionBox title={title} note={`${who} refuses, but says what it would accept instead.`}>
          <Field label="What it would accept">
            <textarea value={counter} onChange={(e) => setCounter(e.target.value)} rows={2} />
          </Field>
          <button disabled={!counter.trim()} onClick={() => run({ type: "settleOffer", offer: offer.id, counter })}>
            Note it
          </button>
        </DecisionBox>
      );
    case "refuse-and-offend-or-leak":
      return (
        <DecisionBox title={title} note={`${who} refuses and takes offense (−1 disposition), or leaks the Offer to a rival (a crumb in the Report). Choose.`}>
          <div className="row">
            <button onClick={() => run({ type: "settleOffer", offer: offer.id, consequence: "offense" })}>It takes offense</button>
            <button onClick={() => run({ type: "settleOffer", offer: offer.id, consequence: "leak" })}>It leaks the Offer</button>
          </div>
        </DecisionBox>
      );
  }
}

function SignalOfferForm({ state, aa, run }: { state: GameState; aa: FactionId; run: Run }) {
  const [text, setText] = useState("");
  const [theirs, setTheirs] = useState<Obligation[]>([]);
  const [mine, setMine] = useState<Obligation[]>([]);
  const who = nameOf(state, aa);
  const disp = state.aa[aa]!.disposition;
  return (
    <DecisionBox
      title={`${who} proposed a deal last turn`}
      note={`Answer it now. It proposes a deal drawn from its objective: ${state.aa[aa]!.objective}.${disp === "open" || disp === "allied" ? " Refusing an Open or Allied AA costs −1 disposition." : ""}`}
    >
      <Field label="Its proposal">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      </Field>
      <div className="row">
        <ObligationsEditor label="You will" turn={state.turn} value={mine} onChange={setMine} />
        <ObligationsEditor label={`${who} will`} turn={state.turn} value={theirs} onChange={setTheirs} />
      </div>
      <div className="row">
        <button
          className="primary"
          disabled={!text.trim()}
          onClick={() => run({ type: "answerSignalOffer", aa, accept: true, terms: { text, obligations: { [state.player]: mine, [aa]: theirs } } })}
        >
          Accept
        </button>
        <button onClick={() => run({ type: "answerSignalOffer", aa, accept: false })}>Refuse</button>
      </div>
    </DecisionBox>
  );
}

/** Deals in force, with the option to break one (steps 2 and 3). */
export function DealsInForce({ state, run }: { state: GameState; run: Run }) {
  const [breaking, setBreaking] = useState<string | null>(null);
  const deals = Object.values(state.deals).filter((d) => d.status === "active" && d.parties.includes(state.player));
  if (!deals.length) return null;
  return (
    <section className="decision">
      <h3>Your deals</h3>
      <ul className="offers">
        {deals.map((d) => (
          <li key={d.id}>
            {d.terms}
            <div className="row">
              <span className="dim">with {d.parties.filter((p) => p !== state.player).map((p) => nameOf(state, p)).join(", ")}</span>
              <button className="link" onClick={() => setBreaking(d.id)}>
                Break this deal
              </button>
            </div>
          </li>
        ))}
      </ul>
      {breaking && (
        <ConfirmModal
          title="Break the deal?"
          message="Its disposition toward you drops by 2 at the end of the turn, and the break goes in the Report."
          confirmLabel="Break it"
          onCancel={() => setBreaking(null)}
          onConfirm={() => {
            run({ type: "breakDeal", deal: breaking });
            setBreaking(null);
          }}
        />
      )}
    </section>
  );
}
