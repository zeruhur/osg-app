import { createRng, rollD6, roll2d6Keep, type Rng } from "@osg/dice";
import { behaviorRules, faceRow } from "@osg/rules-data";
import { EngineError } from "./errors";
import type { EventBody, FactInput, GameEvent, OraclePurpose } from "./events";
import { applyEvent } from "./fold";
import { aaSpendsBonus } from "./rules/aa";
import { moveClock, PROBLEM_ADDRESSED, PROBLEM_WORSENED, END_OF_TURN } from "./rules/clock";
import { dealKeepOdds, jointConfirmOdds } from "./rules/deals";
import { applyCauses, shiftDisposition } from "./rules/disposition";
import { inspirationDisposition, inspirationEntry } from "./rules/inspiration";
import { offerFollowUp, offerOdds, signalOfferRefusalDelta, type OfferFit } from "./rules/offers";
import { askOracle, isYes, rollWhich } from "./rules/oracle";
import { readRoll, resolveConflict, band as bandOf } from "./rules/resolution";
import { investigationResult, ownOneRevealsSecret, rollSecret } from "./rules/secrets";
import { noticeOdds, signalFor } from "./rules/signals";
import { isReordering } from "./rules/standing";
import { aaIds, inspirationCandidates, nextRequired, opponents, type AutoTask, type Decision } from "./turn";
import type {
  ActionClass,
  ActionId,
  ActionState,
  Author,
  DealTerms,
  Debrief,
  FactionId,
  FactTags,
  GameState,
  Grade,
  OracleOdds,
  Report,
  RollMeta,
  SecretStatus,
  Visibility
} from "./types";

/** What the player (or an LLM draft the player accepted) can do. Each command is checked against the
 * turn's open decisions; rolls happen inside the engine, never in a command. */
export type Command =
  | { type: "startGame" }
  | { type: "openTurn" }
  | { type: "advance" }
  | { type: "askOracle"; question: string; odds: OracleOdds }
  // step 2
  | { type: "makeOffer"; aa: FactionId; terms: DealTerms; fit: OfferFit }
  | {
      type: "settleOffer";
      offer: string;
      addition?: "information" | "help" | "disposition";
      /** Yes-but: the condition, and whether the player takes it or walks away. */
      condition?: string;
      takeCondition?: boolean;
      counter?: string;
      consequence?: "offense" | "leak";
    }
  | { type: "answerSignalOffer"; aa: FactionId; accept: boolean; terms?: DealTerms }
  | { type: "breakDeal"; deal: string }
  // step 3
  | { type: "declareAction"; action: ActionInput & { bonus?: string; joint?: FactionId[] } }
  // step 4
  | { type: "answerDealCost"; aa: FactionId; deal: string; costs: boolean }
  | { type: "answerThreat"; aa: FactionId; threatened: boolean }
  | { type: "vetoEntry"; aa: FactionId; reason?: "veto" | "deal" }
  | { type: "chooseTarget"; aa: FactionId; target: FactionId }
  | { type: "writeAAAction"; aa: FactionId; action: ActionInput }
  // step 5
  | { type: "classify"; groups: { class: ActionClass; actions: ActionId[] }[] }
  | { type: "judgeConflict"; group: string; bothCanBeTrue: boolean }
  | { type: "grade"; action: ActionId; grade: Grade; bonusInScope?: boolean }
  | { type: "gradeByOracle"; action: ActionId; bonusInScope?: boolean }
  | { type: "answerForceOfNature"; action: ActionId; use: boolean }
  | { type: "answerInspiration"; action: ActionId; use: boolean }
  | { type: "chooseInspirationTarget"; action: ActionId; target?: FactionId }
  | { type: "answerClockEffect"; action: ActionId; question: "addresses" | "worsens" | "fon-worsens"; yes: boolean }
  | { type: "answerInvestigationSix"; action: ActionId; keep: "both" | "one-and-crumb"; crumbOn?: FactionId }
  | { type: "revealToAA"; action: ActionId; fact: string }
  | { type: "writeOutcome"; action: ActionId; text: string; friction?: string; facts?: NewFact[] }
  // step 6
  | { type: "answerExposure"; aa: FactionId; rollSecret: boolean }
  | { type: "answerInterested"; action: ActionId; aas: FactionId[] }
  // step 7
  | { type: "answerDisposition"; aa: FactionId; keptDealOrBenefited: boolean; harmed: boolean }
  | { type: "rewriteEntry"; aa: FactionId; index: number; text: string; trigger: string }
  | { type: "changeObjective"; aa: FactionId; objective: string; reason: "achieved" | "impossible" }
  | { type: "setStanding"; order: FactionId[] }
  // step 8
  | { type: "publishReport"; report: Report; threads?: { text: string; facts: string[] }[] }
  // any time in a turn
  | { type: "confirmSecret"; aa: FactionId; index: number }
  | { type: "closeThread"; thread: string }
  // after the game
  | { type: "writeDebrief"; debrief: Debrief };

export interface ActionInput {
  act: string;
  out: string;
  lev: string;
  covert?: boolean;
  targets?: FactionId[];
  investigates?: FactionId;
  citedFacts?: string[];
}

export interface NewFact {
  text: string;
  visibility: Visibility;
  tags?: Partial<FactTags>;
  status?: "established" | "rumor";
}

export interface ExecuteOptions {
  /** Defaults to `createRng(state.seed, state.rngPosition)`; tests pass a scripted one. */
  rng?: Rng;
  /** Who issued the command; defaults to "player". Automatic tasks are always "engine". */
  author?: Author;
  /** Run automatic tasks after the command (default true). */
  settle?: boolean;
}

/** Runs a command against the state: checks it, emits its events, then runs every automatic task
 * that becomes possible. Returns the new events (already stamped) and the resulting state. */
export function execute(state: GameState, command: Command, options: ExecuteOptions = {}): { events: GameEvent[]; state: GameState } {
  const tx = new Tx(state, options.rng ?? createRng(state.seed, state.rngPosition), options.author ?? "player");
  handle(tx, command);
  if (options.settle !== false) settle(tx);
  return { events: tx.events, state: tx.state };
}

/** Runs automatic tasks until the turn waits for a decision. */
export function settle(tx: Tx): void {
  for (let guard = 0; guard < 10_000; guard++) {
    const auto = nextRequired(tx.state).auto;
    if (!auto) return;
    runAuto(tx, auto);
  }
  throw new EngineError("invalid", "automatic tasks did not settle");
}

/** A transaction: stamps each event from the state it applies to and applies it at once. */
export class Tx {
  readonly events: GameEvent[] = [];
  constructor(
    public state: GameState,
    readonly rng: Rng,
    readonly author: Author
  ) {}

  emit(body: EventBody, author: Author = this.author): void {
    const s = this.state;
    const event = { ...body, seq: s.nextSeq, turn: s.turn, step: s.step, author } as GameEvent;
    this.state = applyEvent(s, event);
    this.events.push(event);
  }

  /** Rolls with the transaction's Rng and returns the roll's meta (position before, faces). */
  roll<T>(fn: (rng: Rng) => T, faces: (result: T) => number[]): { result: T; meta: RollMeta } {
    const position = this.rng.position;
    const result = fn(this.rng);
    const f = faces(result);
    if (this.rng.position - position !== f.length) throw new EngineError("invalid", "every die rolled must be recorded");
    return { result, meta: { seed: this.rng.seed, position, faces: f } };
  }
}

// ---------- validation helpers ----------

function fail(code: "out-of-order" | "invalid", message: string): never {
  throw new EngineError(code, message);
}

function requireDecision<K extends Decision["kind"]>(s: GameState, kind: K, match: (d: Extract<Decision, { kind: K }>) => boolean = () => true) {
  const d = nextRequired(s).decisions.find((x): x is Extract<Decision, { kind: K }> => x.kind === kind && match(x as Extract<Decision, { kind: K }>));
  if (!d) fail("out-of-order", `no open "${kind}" decision matches this command (turn ${s.turn}, step ${s.step})`);
  return d;
}

function requireStep(s: GameState, ...steps: number[]): void {
  if (!s.turnOpen || !steps.includes(s.step)) fail("out-of-order", `not allowed at step ${s.step}`);
}

const nonEmpty = (text: string, what: string) => {
  if (!text.trim()) fail("invalid", `${what} can't be empty`);
};

function actionFrom(s: GameState, id: string, faction: FactionId, input: ActionInput, source: ActionState["source"], participants = [faction]): ActionState {
  nonEmpty(input.act, "Action");
  nonEmpty(input.out, "Outcome");
  nonEmpty(input.lev, "Leverage");
  for (const f of [...(input.targets ?? []), ...(input.investigates ? [input.investigates] : [])]) {
    if (!s.factions[f]) fail("invalid", `unknown faction ${f}`);
  }
  for (const f of input.citedFacts ?? []) if (!s.facts[f]) fail("invalid", `cites unknown fact ${f}`);
  return {
    id,
    faction,
    participants,
    act: input.act,
    out: input.out,
    lev: input.lev,
    covert: input.covert ?? false,
    targets: [...new Set(input.targets ?? [])],
    investigates: input.investigates,
    source,
    citedFacts: [...(input.citedFacts ?? [])]
  };
}

const factCounter = (s: GameState) => Object.keys(s.facts).length + 1;
const factInput = (s: GameState, f: NewFact, offset: number): FactInput => ({
  id: `f${s.turn}-${factCounter(s) + offset}`,
  text: f.text,
  visibility: f.visibility,
  tags: { factions: f.tags?.factions ?? [], locations: f.tags?.locations ?? [], threads: f.tags?.threads ?? [] },
  status: f.status ?? "established",
  origin: "play"
});

// ---------- the Oracle ----------

function consult(tx: Tx, question: string, odds: OracleOdds, purpose: OraclePurpose) {
  const { result, meta } = tx.roll((rng) => askOracle(odds, rng), (r) => r.faces);
  tx.emit({ type: "OracleConsulted", id: `q${tx.state.nextSeq}`, question, odds, purpose, roll: meta, kept: result.kept, answer: result.answer }, "engine");
  return result.answer;
}

// ---------- commands ----------

function handle(tx: Tx, c: Command): void {
  const s = tx.state;
  switch (c.type) {
    case "startGame":
      requireDecision(s, "startGame");
      return tx.emit({ type: "GameStarted" });

    case "openTurn":
      requireDecision(s, "openTurn");
      return tx.emit({ type: "TurnOpened", opens: s.turn + 1 });

    case "advance": {
      const r = nextRequired(s);
      if (!r.canAdvance) {
        const open = r.decisions.map((d) => d.kind).join(", ");
        fail("out-of-order", `step ${s.step} isn't finished${open ? `: open decisions ${open}` : ""}`);
      }
      return tx.emit({ type: "StepAdvanced", to: (s.step + 1) as 2 });
    }

    case "askOracle":
      nonEmpty(c.question, "The question");
      consult(tx, c.question, c.odds, { kind: "question" });
      return;

    // ---------- step 2 ----------

    case "makeOffer": {
      requireStep(s, 2);
      const aa = s.aa[c.aa] ?? fail("invalid", `${c.aa} is not an AA`);
      nonEmpty(c.terms.text, "The deal");
      const id = `o${s.turn}-${c.aa}`;
      const { odds, steps } = offerOdds(aa.disposition, c.fit);
      tx.emit({ type: "OfferMade", id, aa: c.aa, terms: c.terms, fit: c.fit, odds, steps });
      if (odds === "accepted") tx.emit({ type: "OfferAnswered", id, followUp: "accept" });
      else if (odds === "refused") tx.emit({ type: "OfferAnswered", id, followUp: "refuse" });
      else {
        const answer = consult(tx, `Does ${c.aa} accept?`, odds, { kind: "offer", offer: id });
        tx.emit({ type: "OfferAnswered", id, answer, followUp: offerFollowUp(answer) }, "engine");
      }
      const followUp = tx.state.current.offers[id]!.followUp;
      if (followUp === "accept") strike(tx, id, c.aa, c.terms, {});
      if (followUp === "refuse") tx.emit({ type: "OfferSettled", id, deal: false }, "engine");
      return;
    }

    case "settleOffer": {
      const d = requireDecision(s, "settleOffer", (x) => x.offer === c.offer);
      const offer = s.current.offers[c.offer]!;
      switch (d.followUp) {
        case "accept-and-add": {
          if (!c.addition) fail("invalid", "Yes, and: choose what the AA adds (information, help or disposition)");
          strike(tx, c.offer, offer.aa, offer.terms, { addition: c.addition });
          if (c.addition === "disposition") changeDisposition(tx, offer.aa, 1, "offer-yes-and");
          return;
        }
        case "accept-on-condition": {
          nonEmpty(c.condition ?? "", "The condition");
          if (c.takeCondition === undefined) fail("invalid", "Yes, but: take the condition or walk away (takeCondition)");
          if (c.takeCondition) {
            const terms = { ...offer.terms, text: `${offer.terms.text}; condition: ${c.condition}` };
            strike(tx, c.offer, offer.aa, terms, { condition: c.condition! });
          } else tx.emit({ type: "OfferSettled", id: c.offer, deal: false, condition: c.condition });
          return;
        }
        case "refuse-with-counter":
          nonEmpty(c.counter ?? "", "The counter-proposal");
          return tx.emit({ type: "OfferSettled", id: c.offer, deal: false, counter: c.counter });
        case "refuse-and-offend-or-leak": {
          if (!c.consequence) fail("invalid", "No, and: choose offense or leak");
          tx.emit({ type: "OfferSettled", id: c.offer, deal: false, consequence: c.consequence });
          if (c.consequence === "offense") changeDisposition(tx, offer.aa, -1, "offer-no-and");
          return;
        }
      }
      return;
    }

    case "answerSignalOffer": {
      requireDecision(s, "signalOffer", (x) => x.aa === c.aa);
      tx.emit({ type: "SignalOfferAnswered", aa: c.aa, accept: c.accept });
      if (c.accept) {
        if (!c.terms) fail("invalid", "accepting a Signal Offer needs its terms");
        tx.emit({ type: "DealStruck", deal: { id: `d${s.turn}-${c.aa}-signal`, parties: [s.player, c.aa], terms: c.terms } });
      } else {
        const delta = signalOfferRefusalDelta(s.aa[c.aa]!.disposition);
        if (delta) changeDisposition(tx, c.aa, delta, "refused-signal-offer");
      }
      return;
    }

    case "breakDeal": {
      requireStep(s, 2, 3);
      const deal = s.deals[c.deal] ?? fail("invalid", `unknown deal ${c.deal}`);
      if (!deal.parties.includes(s.player)) fail("invalid", "the player is not a party to that deal");
      return tx.emit({ type: "DealBroken", deal: c.deal, by: s.player });
    }

    // ---------- step 3 ----------

    case "declareAction": {
      requireDecision(s, "declare");
      const { bonus, joint = [] } = c.action;
      if (bonus) {
        const b = s.factions[s.player]!.bonuses.find((x) => x.name === bonus) ?? fail("invalid", `no bonus named ${bonus}`);
        if (b.usesLeft < 1) fail("invalid", `${bonus} has no uses left`);
      }
      for (const aa of joint) {
        if (!s.aa[aa]) fail("invalid", `${aa} is not an AA`);
        const hasJointDeal = Object.values(s.deals).some((d) => d.status === "active" && d.joint && d.parties.includes(aa));
        if (!hasJointDeal) fail("invalid", `a joint action with ${aa} needs an active joint deal (solo_mode.qmd Part V)`);
      }
      const action = actionFrom(s, `a${s.turn}-${s.player}`, s.player, c.action, "player", [s.player, ...joint]);
      return tx.emit({ type: "ActionDeclared", action: { ...action, bonus } });
    }

    // ---------- step 4 ----------

    case "answerDealCost":
      requireDecision(s, "dealKeepCost", (x) => x.aa === c.aa && x.deal === c.deal);
      return tx.emit({ type: "DealKeepCostAnswered", deal: c.deal, aa: c.aa, costs: c.costs });

    case "answerThreat":
      requireDecision(s, "consolidatorThreat", (x) => x.aa === c.aa);
      return tx.emit({ type: "ConsolidatorThreatAnswered", aa: c.aa, threatened: c.threatened });

    case "vetoEntry": {
      requireStep(s, 4);
      const t = s.current.aa[c.aa];
      if (!t?.table || t.action) fail("out-of-order", `${c.aa} has no rolled entry waiting to be written`);
      // A veto rerolls once; a second veto means writing from the behavior rule (rules/aa.ts afterVeto).
      // A "deal" reroll (the entry breaks a refrain obligation) is not a veto.
      return tx.emit({ type: "AAEntryVetoed", aa: c.aa, reason: c.reason ?? "veto" });
    }

    case "chooseTarget": {
      const d = requireDecision(s, "targetChoice", (x) => x.aa === c.aa);
      if (!d.candidates.includes(c.target)) fail("invalid", `${c.target} is not a candidate (${d.candidates.join(", ")})`);
      return tx.emit({ type: "TargetFilled", aa: c.aa, target: c.target, reason: "most in the way of its objective" });
    }

    case "writeAAAction": {
      const d = requireDecision(s, "writeAAAction", (x) => x.aa === c.aa);
      const targets = [...new Set([...(d.target ? [d.target] : []), ...(c.action.targets ?? [])])];
      const action = actionFrom(s, `a${s.turn}-${c.aa}`, c.aa, { ...c.action, targets }, d.source);
      // Acting on the obligation keeps the deal; record it unless a keep check already did.
      if (d.source === "obligation" && s.current.aa[c.aa]?.deals[d.deal!]?.kept !== true) {
        tx.emit({ type: "DealKept", deal: d.deal!, by: c.aa }, "engine");
      }
      return tx.emit({ type: "ActionAccepted", action });
    }

    // ---------- step 5 ----------

    case "classify": {
      const d = requireDecision(s, "classify");
      const seen = c.groups.flatMap((g) => g.actions);
      if (seen.length !== d.actions.length || !d.actions.every((id) => seen.includes(id))) {
        fail("invalid", `classify every action exactly once: ${d.actions.join(", ")}`);
      }
      const groups: { id: string; class: ActionClass; actions: ActionId[] }[] = [];
      for (const g of c.groups) {
        if (g.class === "conflict" && g.actions.length < 2) fail("invalid", "a conflict needs two or more actions");
        if (g.class !== "conflict" && g.actions.length !== 1) fail("invalid", `${g.class} groups hold one action each`);
        for (const id of g.actions) {
          if (s.current.actions[id]!.source === "hold" && g.class !== "unopposed") fail("invalid", `${id} is a hold: holding is unopposed`);
        }
        groups.push({ id: `g${groups.length + 1}`, class: g.class, actions: [...g.actions] });
      }
      return tx.emit({ type: "ActionsClassified", groups });
    }

    case "judgeConflict":
      requireDecision(s, "bothCanBeTrue", (x) => x.group === c.group);
      return tx.emit({ type: "ConflictJudged", group: c.group, bothCanBeTrue: c.bothCanBeTrue });

    case "grade":
    case "gradeByOracle": {
      const d = requireDecision(s, "grade", (x) => x.action === c.action);
      if (d.askBonusScope && c.bonusInScope === undefined) fail("invalid", "this AA has a bonus: say whether the action is within its scope");
      let grade: Grade;
      let source: "player" | "oracle";
      if (c.type === "grade") {
        grade = c.grade;
        source = "player";
      } else {
        // solo_mode.qmd Part III, Grading Leverage: "ask the Oracle, 'Is the leverage Strong?', at Even odds".
        const answer = consult(tx, "Is the leverage Strong?", "even", { kind: "grade", action: c.action });
        grade = isYes(answer) ? "strong" : "weak";
        source = "oracle";
      }
      return tx.emit({ type: "LeverageGraded", action: c.action, grade, source, bonusInScope: d.askBonusScope ? c.bonusInScope : undefined });
    }

    case "answerForceOfNature": {
      requireDecision(s, "forceOfNature", (x) => x.action === c.action);
      tx.emit({ type: "ForceOfNatureAnswered", action: c.action, use: c.use });
      if (c.use) {
        const { result, meta } = tx.roll(rollD6, (f) => [f]);
        const entry = inspirationEntry("forceOfNature", result);
        tx.emit({ type: "ForceOfNatureRolled", action: c.action, roll: meta, face: result, text: entry.text }, "engine");
      }
      return;
    }

    case "answerInspiration": {
      const d = requireDecision(s, "inspiration", (x) => x.action === c.action);
      tx.emit({ type: "InspirationAnswered", action: c.action, use: c.use });
      if (!c.use) return;
      const { result, meta } = tx.roll(rollD6, (f) => [f]);
      const entry = inspirationEntry(d.table, result);
      tx.emit({ type: "InspirationRolled", action: c.action, table: d.table, roll: meta, face: result, text: entry.text, effect: entry.effect }, "engine");
      const candidates = inspirationCandidates(tx.state, c.action, entry.effect);
      if (candidates === undefined || candidates.length <= 1) applyInspiration(tx, c.action, candidates?.[0]);
      return;
    }

    case "chooseInspirationTarget": {
      const d = requireDecision(s, "inspirationTarget", (x) => x.action === c.action);
      if (d.candidates.length && (!c.target || !d.candidates.includes(c.target))) fail("invalid", `choose one of ${d.candidates.join(", ")}`);
      return applyInspiration(tx, c.action, c.target);
    }

    case "answerClockEffect": {
      requireDecision(s, "clockEffect", (x) => x.action === c.action && x.question === c.question);
      tx.emit({ type: "ClockEffectAnswered", action: c.action, question: c.question, yes: c.yes });
      if (c.yes) {
        const addresses = c.question === "addresses";
        moveTheClock(tx, addresses ? PROBLEM_ADDRESSED : PROBLEM_WORSENED, addresses ? "problem-addressed" : "problem-worsened");
      }
      return;
    }

    case "answerInvestigationSix": {
      requireDecision(s, "investigationSix", (x) => x.action === c.action);
      if (c.keep === "one-and-crumb" && (!c.crumbOn || !s.factions[c.crumbOn])) fail("invalid", "name the faction the crumb is on");
      tx.emit({ type: "InvestigationSixAnswered", action: c.action, keep: c.keep, crumbOn: c.crumbOn });
      const a = s.current.actions[c.action]!;
      for (let i = 0; i < (c.keep === "both" ? 2 : 1); i++) uncoverSecret(tx, a.investigates!, "private", [a.faction], "investigation", c.action);
      return tx.emit({ type: "SecretsResolved", action: c.action, kind: "investigation" }, "engine");
    }

    case "revealToAA": {
      const d = requireDecision(s, "revealToAA", (x) => x.action === c.action);
      const f = s.facts[c.fact] ?? fail("invalid", `unknown fact ${c.fact}`);
      if (f.visibility.kind !== "private" || f.visibility.faction !== s.player) fail("invalid", "reveal one of your own private facts");
      return tx.emit({ type: "FactRevealed", fact: c.fact, to: d.aa, action: c.action });
    }

    case "writeOutcome": {
      requireDecision(s, "writeOutcome", (x) => x.action === c.action);
      nonEmpty(c.text, "The outcome");
      const facts = (c.facts ?? []).map((f, i) => factInput(s, f, i));
      return tx.emit({ type: "OutcomeAccepted", action: c.action, text: c.text, friction: c.friction, facts });
    }

    // ---------- step 6 ----------

    case "answerExposure": {
      requireDecision(s, "exposure", (x) => x.aa === c.aa);
      tx.emit({ type: "ExposureAnswered", aa: c.aa, rollSecret: c.rollSecret });
      // "Name the vulnerability in the Report": an Exposure is public.
      if (c.rollSecret) uncoverSecret(tx, c.aa, "public", [], "exposure");
      return;
    }

    case "answerInterested": {
      requireDecision(s, "interested", (x) => x.action === c.action);
      for (const aa of c.aas) if (!s.aa[aa]) fail("invalid", `${aa} is not an AA`);
      return tx.emit({ type: "InterestedAnswered", action: c.action, aas: [...new Set(c.aas)] });
    }

    // ---------- step 7 ----------

    case "answerDisposition": {
      requireDecision(s, "dispositionCauses", (x) => x.aa === c.aa);
      tx.emit({ type: "DispositionCausesAnswered", aa: c.aa, keptDealOrBenefited: c.keptDealOrBenefited, harmed: c.harmed });
      const already = s.current.causes[c.aa] ?? [];
      const brokeDeal = Object.values(s.deals).some((d) => d.parties.includes(c.aa) && d.brokenBy === s.player && d.brokenTurn === s.turn);
      // Each cause once per turn: a covert action it noticed this turn already cost −1 (same cause as "harmed or uncovered").
      const causes = {
        keptDealOrBenefited: c.keptDealOrBenefited,
        harmedOrUncoveredCovert: c.harmed && !already.includes("uncovered-covert"),
        brokeDeal
      };
      const names = [
        ...(causes.keptDealOrBenefited ? ["kept-deal-or-benefited"] : []),
        ...(causes.harmedOrUncoveredCovert ? ["harmed"] : []),
        ...(causes.brokeDeal ? ["broke-deal"] : [])
      ];
      const from = tx.state.aa[c.aa]!.disposition;
      const to = applyCauses(from, causes);
      if (names.length) tx.emit({ type: "DispositionChanged", aa: c.aa, from, to, causes: names }, "engine");
      return;
    }

    case "rewriteEntry": {
      requireDecision(s, "adaptation", (x) => x.aa === c.aa && x.trigger === c.trigger);
      nonEmpty(c.text, "The new entry");
      return tx.emit({ type: "TableEntryRewritten", aa: c.aa, index: c.index, text: c.text, trigger: c.trigger });
    }

    case "changeObjective": {
      requireStep(s, 7);
      if (!s.aa[c.aa]) fail("invalid", `${c.aa} is not an AA`);
      nonEmpty(c.objective, "The objective");
      tx.emit({ type: "ObjectiveChanged", aa: c.aa, objective: c.objective, reason: c.reason });
      if (c.reason === "impossible") {
        // solo_mode.qmd Part IV, Adaptation: "you roll a new behavior rule".
        const { result, meta } = tx.roll(rollD6, (f) => [f]);
        tx.emit({ type: "BehaviorRerolled", aa: c.aa, roll: meta, behavior: faceRow(behaviorRules.rows, result).id }, "engine");
      }
      return;
    }

    case "setStanding": {
      requireDecision(s, "standing");
      if (!isReordering(s.standing, c.order)) fail("invalid", "Standing must order exactly the active factions");
      return tx.emit({ type: "StandingSet", order: [...c.order], reason: `End of turn ${s.turn}` });
    }

    // ---------- step 8 ----------

    case "publishReport": {
      requireDecision(s, "report");
      nonEmpty(c.report.header, "The Report header");
      nonEmpty(c.report.closing, "The closing observation");
      const base = Object.keys(s.threads).length;
      const threads = (c.threads ?? []).map((t, i) => ({ id: `t${base + i + 1}`, text: t.text, facts: [...t.facts] }));
      return tx.emit({ type: "ReportPublished", report: c.report, threads });
    }

    case "confirmSecret": {
      if (!s.turnOpen) fail("out-of-order", "no turn is open");
      return tx.emit({ type: "SecretConfirmed", aa: c.aa, index: c.index });
    }

    case "closeThread":
      return tx.emit({ type: "ThreadClosed", thread: c.thread });

    case "writeDebrief":
      if (s.status !== "ended") fail("out-of-order", "the Debrief comes after the game ends");
      return tx.emit({ type: "DebriefWritten", debrief: c.debrief });
  }
}

// ---------- shared effects ----------

function strike(tx: Tx, offer: string, aa: FactionId, terms: DealTerms, extra: { addition?: "information" | "help" | "disposition"; condition?: string }): void {
  const id = `d${tx.state.turn}-${aa}`;
  tx.emit({ type: "OfferSettled", id: offer, deal: true, dealId: id, ...extra });
  tx.emit({ type: "DealStruck", deal: { id, parties: [tx.state.player, aa], terms } }, "engine");
}

function changeDisposition(tx: Tx, aa: FactionId, delta: number, cause: string): void {
  // Emitted even when clamped (from === to): the cause still happened, and counts once per turn.
  const from = tx.state.aa[aa]!.disposition;
  tx.emit({ type: "DispositionChanged", aa, from, to: shiftDisposition(from, delta), causes: [cause] }, "engine");
}

function moveTheClock(tx: Tx, delta: number, reason: "turn" | "problem-addressed" | "problem-worsened" | "inspiration"): void {
  const { position, landing } = moveClock(tx.state.clock, delta);
  tx.emit({ type: "ClockMoved", delta, reason, position }, "engine");
  for (const box of landing) tx.emit({ type: "EscalationLanded", box }, "engine");
}

function uncoverSecret(
  tx: Tx,
  aa: FactionId,
  status: SecretStatus,
  knownBy: FactionId[],
  cause: "investigation" | "own-one" | "exposure" | "inspiration",
  action?: ActionId
): void {
  const state = tx.state.aa[aa];
  if (!state) return; // background factions have no Secret Table
  const uncovered = state.secrets.map((x) => x.index);
  if (uncovered.length >= 6) return;
  const { result, meta } = tx.roll((rng) => rollSecret(rng, uncovered)!, (r) => r.faces);
  const text = state.secretTable[result.index]!;
  const visibility: Visibility =
    status === "public" ? { kind: "public" } : knownBy[0] ? { kind: "private", faction: knownBy[0] } : { kind: "player-only" };
  const fact: FactInput = {
    id: `secret-${aa}-${result.index + 1}`,
    text,
    visibility,
    tags: { factions: [aa], locations: [], threads: [] },
    status: status === "rumor" ? "rumor" : "established",
    origin: "play"
  };
  tx.emit({ type: "SecretRolled", aa, roll: meta, index: result.index, status, knownBy: status === "public" ? [] : knownBy, fact, cause, action }, "engine");
}

function applyInspiration(tx: Tx, action: ActionId, target: FactionId | undefined): void {
  const s = tx.state;
  const a = s.current.actions[action]!;
  const effect = s.current.adjudication[action]!.inspiration!.effect;
  tx.emit({ type: "InspirationApplied", action, effect: effect ?? "none", target });
  switch (effect) {
    case "clock-back":
      return moveTheClock(tx, -1, "inspiration");
    case "clock-forward":
      return moveTheClock(tx, 1, "inspiration");
    case "disposition-up":
    case "disposition-down": {
      const opp = opponents(s, action);
      const move = inspirationDisposition({ effect, actor: a.faction, player: s.player, actedOn: opp.includes(s.player) ? s.player : undefined, involvedAA: target });
      if (move) changeDisposition(tx, move.aa, move.delta, `inspiration-${effect}`);
      return;
    }
    case "roll-secret":
      if (target) uncoverSecret(tx, target, "private", [a.faction], "inspiration", action);
      return;
    default:
      return; // narrative effects, and Standing moves (folded into the step 7 proposal)
  }
}

// ---------- automatic tasks ----------

function runAuto(tx: Tx, task: AutoTask): void {
  const s = tx.state;
  const engine = "engine" as const;
  switch (task.kind) {
    case "jointConfirm": {
      const disposition = s.aa[task.aa]!.disposition;
      const odds = jointConfirmOdds(disposition);
      const joined = odds === "automatic" ? true : isYes(consult(tx, `Does ${task.aa} confirm?`, "likely", { kind: "joint-confirm", aa: task.aa, action: task.action }));
      return tx.emit({ type: "JointResolved", aa: task.aa, action: task.action, joined }, engine);
    }

    case "dealKeepCheck": {
      const aa = s.aa[task.aa]!;
      const odds = dealKeepOdds(aa.disposition, aa.behavior);
      const kept = odds === "automatic" ? true : isYes(consult(tx, `Does ${task.aa} keep the deal?`, odds, { kind: "deal-keep", deal: task.deal, aa: task.aa }));
      return tx.emit(kept ? { type: "DealKept", deal: task.deal, by: task.aa } : { type: "DealBroken", deal: task.deal, by: task.aa }, engine);
    }

    case "hold": {
      // "It consolidates: an unopposed action that secures something it already has."
      const action: ActionState = {
        id: `a${s.turn}-${task.aa}`,
        faction: task.aa,
        participants: [task.aa],
        act: "Consolidates: secures something it already holds",
        out: "Its position holds",
        lev: task.reason,
        covert: false,
        targets: [],
        source: "hold",
        citedFacts: []
      };
      return tx.emit({ type: "AAHeld", aa: task.aa, reason: task.reason, action }, engine);
    }

    case "rollTable": {
      const { result, meta } = tx.roll(rollD6, (f) => [f]);
      const reason = s.current.aa[task.aa]?.lastReroll ?? "roll";
      return tx.emit({ type: "AATableRolled", aa: task.aa, roll: meta, index: result - 1, entry: s.aa[task.aa]!.actionTable[result - 1]!, reason }, engine);
    }

    case "fillTarget":
      return tx.emit({ type: "TargetFilled", aa: task.aa, target: task.target, reason: task.reason }, engine);

    case "resolveGroup":
      return resolveGroup(tx, task.group);

    case "rollSignals": {
      for (const aa of aaIds(s)) {
        if (s.current.signals[aa]) continue;
        const { result, meta } = tx.roll(rollD6, (f) => [f]);
        tx.emit({ type: "SignalRolled", aa, roll: meta, face: result, signal: signalFor(result) }, engine);
      }
      return;
    }

    case "noticeCheck": {
      const a = s.current.actions[task.action]!;
      const odds = noticeOdds({ aaLeverage: aaIds(s).map((id) => s.factions[id]!.leverage), targetedAnAA: a.targets.some((f) => s.aa[f]) });
      consult(tx, "Is it noticed?", odds, { kind: "notice", action: task.action });
      return;
    }

    case "whoNotices": {
      let by: FactionId;
      let roll: RollMeta | undefined;
      if (task.candidates.length === 1) by = task.candidates[0]!;
      else {
        const r = tx.roll((rng) => rollWhich(task.candidates, rng), (x) => [x.face]);
        by = r.result.value;
        roll = r.meta;
      }
      tx.emit({ type: "CovertNoticed", action: task.action, by, roll }, engine);
      changeDisposition(tx, by, -1, "uncovered-covert");
      return;
    }

    case "expireDeals":
      for (const deal of task.deals) tx.emit({ type: "DealEnded", deal }, engine);
      return;

    case "advanceClock":
      return moveTheClock(tx, END_OF_TURN, "turn");

    case "closeTurn":
      return tx.emit({ type: "TurnClosed" }, engine);

    case "endGame":
      return tx.emit({ type: "GameEnded" }, engine);
  }
}

/** Rolls and bands one classified group (contested_ground.qmd Part IV). Grades are already
 * events; nothing here can change them. */
function resolveGroup(tx: Tx, groupId: string): void {
  const s = tx.state;
  const g = s.current.groups!.find((x) => x.id === groupId)!;

  if (g.class === "unopposed") {
    // "The Actor gets their desired outcome." No roll, so no bonus is spent.
    for (const id of g.actions) tx.emit({ type: "ResultBanded", action: id, band: "success", outcome: "unopposed" }, "engine");
    for (const id of g.actions) afterBand(tx, id);
    return;
  }

  const effective: { id: string; effective: number }[] = [];
  for (const id of g.actions) {
    const a = s.current.actions[id]!;
    const adj = s.current.adjudication[id]!;
    const grade = adj.grade!;
    let bonus: string | undefined = a.bonus;
    if (!bonus && a.faction !== s.player && s.aa[a.faction]) {
      const b = s.factions[a.faction]!.bonuses.find((x) => x.usesLeft > 0);
      if (b && aaSpendsBonus({ usesLeft: b.usesLeft, inScope: adj.bonusInScope ?? false, grade, inConflict: g.class === "conflict" })) bonus = b.name;
    }
    const { result, meta } = tx.roll((rng) => roll2d6Keep("high", rng).dice, (d) => [...d]);
    const r = readRoll(grade, !!bonus, result);
    tx.emit(
      {
        type: "DiceRolled",
        action: id,
        grade,
        keep: r.keep,
        roll: meta,
        kept: r.kept,
        effective: r.effective,
        doubles: r.doubles,
        bonusEffect: r.bonusEffect
      },
      "engine"
    );
    if (bonus) tx.emit({ type: "BonusSpent", faction: a.faction, bonus, action: id }, "engine");
    effective.push({ id, effective: r.effective });
  }

  if (g.class === "opposed") {
    tx.emit({ type: "ResultBanded", action: g.actions[0]!, band: bandOf(effective[0]!.effective), outcome: "rolled" }, "engine");
  } else {
    for (const r of resolveConflict(effective, g.bothCanBeTrue ?? false)) {
      tx.emit({ type: "ResultBanded", action: r.id, band: r.band, outcome: r.outcome }, "engine");
    }
  }
  for (const id of g.actions) afterBand(tx, id);
}

/** Secret checks that need no decision, right after an action is banded. */
function afterBand(tx: Tx, id: ActionId): void {
  const s = tx.state;
  const a = s.current.actions[id]!;
  const adj = s.current.adjudication[id]!;

  // "It rolls a 1 on any adjudication. The secret comes out publicly in the Report."
  if (adj.rolled && ownOneRevealsSecret(adj.rolled.kept)) {
    for (const p of a.participants) if (s.aa[p]) uncoverSecret(tx, p, "public", [], "own-one", id);
    tx.emit({ type: "SecretsResolved", action: id, kind: "own-one" }, "engine");
  }

  // A successful investigation of an AA: 4-5 private, 2-3 rumor (a 6 asks the player first).
  if (a.investigates && s.aa[a.investigates] && a.investigates !== s.player) {
    const r = investigationResult(tx.state.current.adjudication[id]!.band!);
    if (r.rolls === 2) return; // investigationSix decision
    if (r.rolls === 1) uncoverSecret(tx, a.investigates, r.status, [a.faction], "investigation", id);
    tx.emit({ type: "SecretsResolved", action: id, kind: "investigation" }, "engine");
  } else if (a.investigates) {
    tx.emit({ type: "SecretsResolved", action: id, kind: "investigation" }, "engine");
  }
}
