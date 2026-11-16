import { fillTarget, holds } from "./rules/aa";
import { obligationReplacesTable, obligationsNow } from "./rules/deals";
import { inspirationTableFor } from "./rules/inspiration";
import { forceOfNatureAvailable, succeeds } from "./rules/resolution";
import { investigationResult } from "./rules/secrets";
import type { ActionId, ActionState, Deal, DealId, FactionId, GameState, Obligation } from "./types";

// The turn state machine (solo_mode.qmd Part X). `nextRequired` reads the state and says what has
// to happen next: decisions only the player can make (judgment, writing), and automatic tasks the
// engine performs itself (rolls the rules call for, bookkeeping). A step can advance only when
// neither is left.

/** A decision point: the turn waits for the player (or an LLM draft the player accepts). */
export type Decision =
  | { kind: "startGame" }
  | { kind: "openTurn" }
  | { kind: "settleOffer"; offer: string; followUp: "accept-and-add" | "accept-on-condition" | "refuse-with-counter" | "refuse-and-offend-or-leak" }
  | { kind: "signalOffer"; aa: FactionId }
  | { kind: "declare" }
  | { kind: "dealKeepCost"; aa: FactionId; deal: DealId }
  | { kind: "consolidatorThreat"; aa: FactionId }
  | { kind: "targetChoice"; aa: FactionId; candidates: FactionId[]; prefer?: FactionId | undefined; avoid?: FactionId | undefined }
  | {
      kind: "writeAAAction";
      aa: FactionId;
      source: "table" | "obligation" | "exploit" | "rule";
      entry?: string | undefined;
      target?: FactionId | undefined;
      deal?: DealId | undefined;
      obligation?: Obligation | undefined;
    }
  | { kind: "classify"; actions: ActionId[] }
  | { kind: "bothCanBeTrue"; group: string }
  | { kind: "grade"; action: ActionId; askBonusScope: boolean }
  | { kind: "forceOfNature"; action: ActionId }
  | { kind: "inspiration"; action: ActionId; table: "especiallyGood" | "especiallyBad" }
  | { kind: "inspirationTarget"; action: ActionId; effect: string; candidates: FactionId[] }
  | { kind: "clockEffect"; action: ActionId; question: "addresses" | "worsens" | "fon-worsens" }
  | { kind: "investigationSix"; action: ActionId }
  | { kind: "revealToAA"; action: ActionId; aa: FactionId }
  | { kind: "writeOutcome"; action: ActionId }
  | { kind: "exposure"; aa: FactionId }
  | { kind: "interested"; action: ActionId }
  | { kind: "dispositionCauses"; aa: FactionId }
  | { kind: "adaptation"; aa: FactionId; trigger: string }
  | { kind: "standing"; proposal: FactionId[] }
  | { kind: "report" };

/** Work the engine does on its own, in order, as soon as nothing blocks it. */
export type AutoTask =
  | { kind: "jointConfirm"; aa: FactionId; action: ActionId }
  | { kind: "dealKeepCheck"; aa: FactionId; deal: DealId }
  | { kind: "hold"; aa: FactionId; reason: string }
  | { kind: "rollTable"; aa: FactionId }
  | { kind: "fillTarget"; aa: FactionId; target: FactionId; reason: string }
  | { kind: "resolveGroup"; group: string }
  | { kind: "rollSignals" }
  | { kind: "noticeCheck"; action: ActionId }
  | { kind: "whoNotices"; action: ActionId; candidates: FactionId[] }
  | { kind: "expireDeals"; deals: DealId[] }
  | { kind: "advanceClock" }
  | { kind: "closeTurn" }
  | { kind: "endGame" };

export interface Requirements {
  decisions: Decision[];
  auto?: AutoTask | undefined;
  /** True when the current step's work is done and `advance` may move to the next step. */
  canAdvance: boolean;
}

export function nextRequired(s: GameState): Requirements {
  if (s.status === "setup") return { decisions: [{ kind: "startGame" }], canAdvance: false };
  if (s.status === "ended") return { decisions: [], canAdvance: false };
  if (!s.turnOpen) {
    if (s.turn === s.turns) return { decisions: [], auto: { kind: "endGame" }, canAdvance: false };
    return { decisions: [{ kind: "openTurn" }], canAdvance: false };
  }
  const r = STEPS[s.step - 1]!(s);
  return { ...r, canAdvance: s.step < 8 && r.decisions.length === 0 && !r.auto };
}

type StepFn = (s: GameState) => { decisions: Decision[]; auto?: AutoTask | undefined };

const STEPS: StepFn[] = [takeStock, talk, declare, aaActions, adjudicate, signalsAndNotice, update, report];

// ---------- helpers ----------

export const aaIds = (s: GameState): FactionId[] => s.scenario.aas.map((a) => a.faction).filter((id) => s.aa[id]);

/** Active deals the AA is a party to, with its obligations that bind this turn. */
export function aaDeals(s: GameState, aa: FactionId): { deal: Deal; obligations: Obligation[] }[] {
  return Object.values(s.deals)
    .filter((d) => d.status === "active" && d.parties.includes(aa))
    .map((deal) => ({ deal, obligations: obligationsNow(deal.obligations[aa] ?? [], s.turn) }));
}

/** The factions an action is up against: its targets and, in a conflict, the other actions' actors. */
export function opponents(s: GameState, id: ActionId): FactionId[] {
  const a = s.current.actions[id]!;
  const group = s.current.groups?.find((g) => g.actions.includes(id));
  const rivals = group?.class === "conflict" ? group.actions.filter((x) => x !== id).flatMap((x) => s.current.actions[x]!.participants) : [];
  return [...new Set([...a.targets, ...rivals])].filter((f) => !a.participants.includes(f));
}

/** The candidates for an Inspiration effect that needs a faction, or undefined if it needs none. */
export function inspirationCandidates(s: GameState, id: ActionId, effect: string | undefined): FactionId[] | undefined {
  const a = s.current.actions[id]!;
  const opp = opponents(s, id);
  switch (effect) {
    case "rival-down":
    case "rival-up":
      return opp.filter((f) => s.standing.includes(f));
    case "roll-secret":
      return opp.filter((f) => s.aa[f]);
    case "disposition-up":
    case "disposition-down":
      // The player acts: "one AA involved". An AA acts: no choice (inspirationDisposition).
      return a.faction === s.player ? opp.filter((f) => s.aa[f]) : undefined;
    default:
      return undefined;
  }
}

// ---------- step 1 ----------

function takeStock(): ReturnType<StepFn> {
  return { decisions: [] };
}

// ---------- step 2 ----------

function talk(s: GameState): ReturnType<StepFn> {
  const decisions: Decision[] = [];
  for (const aa of aaIds(s)) if (s.aa[aa]!.signalOffer) decisions.push({ kind: "signalOffer", aa });
  for (const o of Object.values(s.current.offers)) {
    if (o.settled || !o.followUp) continue;
    if (o.followUp === "accept" || o.followUp === "refuse") continue;
    decisions.push({ kind: "settleOffer", offer: o.id, followUp: o.followUp });
  }
  return { decisions };
}

// ---------- step 3 ----------

function declare(s: GameState): ReturnType<StepFn> {
  const declared = s.current.order.some((id) => s.current.actions[id]!.source === "player");
  return { decisions: declared ? [] : [{ kind: "declare" }] };
}

// ---------- step 4 ----------

function aaActions(s: GameState): ReturnType<StepFn> {
  // "For each AA, in order" (solo_mode.qmd Part X, 4): one AA at a time.
  for (const aa of aaIds(s)) {
    const next = aaNext(s, aa);
    if (next) return next;
  }
  return { decisions: [] };
}

/** What one AA still needs in step 4, or undefined when its action (or its hold) is in. */
export function aaNext(s: GameState, aa: FactionId): ReturnType<StepFn> | undefined {
  const t = s.current.aa[aa] ?? { deals: {}, rolls: 0, vetoes: 0, writeFromRule: false };
  const state = s.aa[aa]!;
  if (t.action) return undefined;

  // A partner in the player's joint action confirms first (solo_mode.qmd Part V, Joint Actions).
  if (t.joint === "pending") {
    const action = s.current.order.find((id) => s.current.actions[id]!.participants.includes(aa))!;
    return { decisions: [], auto: { kind: "jointConfirm", aa, action } };
  }
  if (t.joint === "joined") return undefined;

  // 1. Deals: keep checks, then an obligation or the exploited break replaces the table.
  for (const { deal, obligations } of aaDeals(s, aa)) {
    if (obligations.length === 0) continue;
    const dt = t.deals[deal.id] ?? {};
    if (dt.kept !== undefined) continue;
    if (state.behavior === "schemer") return { decisions: [], auto: { kind: "dealKeepCheck", aa, deal: deal.id } };
    if (dt.costs === undefined) return { decisions: [{ kind: "dealKeepCost", aa, deal: deal.id }] };
    if (dt.costs) return { decisions: [], auto: { kind: "dealKeepCheck", aa, deal: deal.id } };
  }
  const broken = Object.values(s.deals).find((d) => d.status === "broken" && d.brokenBy === aa && d.brokenTurn === s.turn);
  if (broken) return { decisions: [{ kind: "writeAAAction", aa, source: "exploit", deal: broken.id }] };
  for (const { deal, obligations } of aaDeals(s, aa)) {
    const act = obligationReplacesTable(obligations, s.turn);
    if (act) return { decisions: [{ kind: "writeAAAction", aa, source: "obligation", deal: deal.id, obligation: act }] };
  }

  // 2. Hold rule.
  const h = holds({ behavior: state.behavior, turn: s.turn, actedUponLastTurn: state.actedUponLastTurn, threatenedInLastReport: t.threatened });
  if ("needs" in h) return { decisions: [{ kind: "consolidatorThreat", aa }] };
  if (h.holds) return { decisions: [], auto: { kind: "hold", aa, reason: h.reason } };

  // 3. The table: roll, fill [target], expand.
  if (t.writeFromRule) return { decisions: [{ kind: "writeAAAction", aa, source: "rule" }] };
  if (!t.table) return { decisions: [], auto: { kind: "rollTable", aa } };
  if (t.table.entry.includes("[target]") && !t.target) {
    const r = fillTarget({
      self: aa,
      behavior: state.behavior,
      disposition: state.disposition,
      player: s.player,
      standing: s.standing,
      lastAffectedBy: state.lastAffectedBy,
      forcedOnPlayer: state.targetsPlayerNext
    });
    if (r.kind === "filled") return { decisions: [], auto: { kind: "fillTarget", aa, target: r.target, reason: r.reason } };
    return { decisions: [{ kind: "targetChoice", aa, candidates: r.candidates, prefer: r.prefer, avoid: r.avoid }] };
  }
  return { decisions: [{ kind: "writeAAAction", aa, source: "table", entry: t.table.entry, target: t.target }] };
}

// ---------- step 5 ----------

function adjudicate(s: GameState): ReturnType<StepFn> {
  const cur = s.current;
  if (!cur.groups) return { decisions: [{ kind: "classify", actions: [...cur.order] }] };
  const decisions: Decision[] = [];
  let auto: AutoTask | undefined;

  for (const g of cur.groups) {
    if (g.resolved) continue;
    const before = decisions.length;
    if (g.class === "conflict" && g.actions.length === 2 && g.bothCanBeTrue === undefined) decisions.push({ kind: "bothCanBeTrue", group: g.id });
    if (g.class !== "unopposed") {
      for (const id of g.actions) {
        if (cur.adjudication[id]!.grade) continue;
        decisions.push({ kind: "grade", action: id, askBonusScope: aaHasBonus(s, cur.actions[id]!) });
      }
    }
    if (decisions.length === before) auto ??= { kind: "resolveGroup", group: g.id };
  }

  for (const id of cur.order) {
    const a = cur.adjudication[id]!;
    if (!a.band) continue;
    const action = cur.actions[id]!;
    const open: Decision[] = [];

    if (a.rolled?.doubles && a.forceOfNature === undefined && forceOfNatureAvailable(true, s.forceOfNatureUsed)) {
      open.push({ kind: "forceOfNature", action: id });
    }
    if (a.forceOfNature?.use && a.clock.fonWorsens === undefined) open.push({ kind: "clockEffect", action: id, question: "fon-worsens" });

    const table = a.rolled ? inspirationTableFor(a.band) : undefined;
    if (table && a.inspiration === undefined) open.push({ kind: "inspiration", action: id, table });
    if (a.inspiration?.use && a.inspiration.applied === false) {
      const candidates = inspirationCandidates(s, id, a.inspiration.effect) ?? [];
      open.push({ kind: "inspirationTarget", action: id, effect: a.inspiration.effect!, candidates });
    }
    if (a.rolled && a.band === "especially-good" && a.clock.addresses === undefined) open.push({ kind: "clockEffect", action: id, question: "addresses" });
    if (a.band === "especially-bad" && a.inspiration?.use && a.inspiration.effect !== "clock-forward" && a.clock.worsens === undefined) {
      open.push({ kind: "clockEffect", action: id, question: "worsens" });
    }

    if (action.investigates && !a.secrets.investigation) {
      if (s.aa[action.investigates] && investigationResult(a.band).rolls === 2) open.push({ kind: "investigationSix", action: id });
    }
    if (action.investigates === s.player && action.faction !== s.player && succeeds(a.band) && !a.secrets.revealedToAA) {
      open.push({ kind: "revealToAA", action: id, aa: action.faction });
    }

    if (open.length === 0 && a.outcome === undefined) open.push({ kind: "writeOutcome", action: id });
    decisions.push(...open);
  }
  return { decisions, auto };
}

function aaHasBonus(s: GameState, a: ActionState): boolean {
  return a.faction !== s.player && !!s.aa[a.faction] && s.factions[a.faction]!.bonuses.some((b) => b.usesLeft > 0);
}

// ---------- step 6 ----------

function signalsAndNotice(s: GameState): ReturnType<StepFn> {
  const cur = s.current;
  if (aaIds(s).some((aa) => !cur.signals[aa])) return { decisions: [], auto: { kind: "rollSignals" } };
  const decisions: Decision[] = [];
  for (const aa of aaIds(s)) if (cur.signals[aa]!.signal === "exposure" && !cur.signals[aa]!.exposureAnswered) decisions.push({ kind: "exposure", aa });

  for (const id of cur.order) {
    const a = cur.actions[id]!;
    if (a.source !== "player" || !a.covert) continue;
    const n = cur.notice[id];
    if (!n?.checked) return { decisions, auto: { kind: "noticeCheck", action: id } };
    if (!n.noticed || n.by) continue;
    const targeted = a.targets.filter((f) => s.aa[f]);
    const candidates = targeted.length ? targeted : n.interested;
    if (!candidates) decisions.push({ kind: "interested", action: id });
    else if (candidates.length) return { decisions, auto: { kind: "whoNotices", action: id, candidates } };
  }
  return { decisions };
}

// ---------- step 7 ----------

function update(s: GameState): ReturnType<StepFn> {
  const cur = s.current;
  const decisions: Decision[] = [];
  for (const aa of aaIds(s)) if (!cur.dispositionAnswered.includes(aa)) decisions.push({ kind: "dispositionCauses", aa });
  for (const aa of aaIds(s)) for (const trigger of cur.adaptation[aa] ?? []) decisions.push({ kind: "adaptation", aa, trigger });

  const expiring = Object.values(s.deals).filter((d) => d.status === "active" && d.until !== undefined && d.until <= s.turn);
  if (expiring.length) return { decisions, auto: { kind: "expireDeals", deals: expiring.map((d) => d.id) } };
  if (!cur.clockAdvanced) return { decisions, auto: { kind: "advanceClock" } };
  // Standing last: "reorder from what the Report shows" once everything else is settled.
  if (!cur.standingSet && decisions.length === 0) decisions.push({ kind: "standing", proposal: [...cur.standingProposal] });
  return { decisions };
}

// ---------- step 8 ----------

function report(s: GameState): ReturnType<StepFn> {
  if (!s.current.reported) return { decisions: [{ kind: "report" }] };
  return { decisions: [], auto: { kind: "closeTurn" } };
}
