import { DispositionId } from "@osg/rules-data";
import { EngineError } from "./errors";
import type { EventOf, FactInput, GameEvent } from "./events";
import { isYes } from "./rules/oracle";
import { moveDown, moveUp } from "./rules/standing";
import type { ActionState, AdjudicationState, FactionState, GameState, TurnData } from "./types";

/** Rebuilds the game from its log. The only way to get a `GameState`. */
export function fold(events: readonly GameEvent[]): GameState {
  let state: GameState | undefined;
  for (const event of events) state = applyEvent(state, event);
  if (!state) throw new EngineError("no-game", "empty event log");
  return state;
}

/** Applies one event. Pure: never mutates `state` or `event`; returns a new state. Throws an
 * `EngineError` if the event can't apply (see errors.ts).
 *
 * The reducer keeps books; it doesn't apply rules. Commands decide (with the rules modules) and
 * write the outcome into events; the reducer only checks that an event fits the state's structure. */
export function applyEvent(state: GameState | undefined, event: GameEvent): GameState {
  if (!state) {
    if (event.type !== "GameCreated") throw new EngineError("no-game", `first event is ${event.type}, not GameCreated`, event.seq);
    if (event.seq !== 0) throw new EngineError("bad-sequence", `GameCreated must be seq 0`, event.seq);
    return created(event);
  }
  if (event.seq !== state.nextSeq) {
    throw new EngineError("bad-sequence", `expected seq ${state.nextSeq}, got ${event.seq}`, event.seq);
  }
  const draft = structuredClone(state) as GameState;
  reduce(draft, event);
  draft.nextSeq = state.nextSeq + 1;
  if ("roll" in event && event.roll) draft.rngPosition = event.roll.position + event.roll.faces.length;
  return draft;
}

export function emptyTurnData(standing: readonly string[] = []): TurnData {
  return {
    offers: {},
    aa: {},
    actions: {},
    order: [],
    adjudication: {},
    signals: {},
    notice: {},
    causes: {},
    dispositionAnswered: [],
    adaptation: {},
    clockAdvanced: false,
    standingProposal: [...standing],
    standingSet: false,
    reported: false
  };
}

function created(e: EventOf<"GameCreated">): GameState {
  const factions: Record<string, FactionState> = {};
  for (const f of e.scenario.factions) {
    factions[f.id] = structuredClone({ ...f, bonuses: f.bonuses.map((b) => ({ ...b, usesLeft: b.uses })) });
  }
  if (factions[e.player]?.kind !== "player") {
    throw new EngineError("invalid", `player faction ${e.player} is not the scenario's player faction`, e.seq);
  }
  const aa: GameState["aa"] = Object.fromEntries(
    e.scenario.aas.map((a) => [
      a.faction,
      {
        ...structuredClone(a),
        disposition: "neutral" as const,
        objective: factions[a.faction]!.objectives.shortTerm,
        actedUponLastTurn: false,
        targetsPlayerNext: false,
        secrets: [],
        signalOffer: false
      }
    ])
  );
  return {
    seed: e.seed,
    nextSeq: 1,
    rngPosition: 0,
    status: "setup",
    turns: e.turns,
    turn: 0,
    step: 0,
    turnOpen: false,
    player: e.player,
    scenario: structuredClone(e.scenario),
    factions,
    aa,
    standing: [],
    clock: { length: 0, position: 0, escalations: [] },
    facts: {},
    threads: {},
    deals: {},
    forceOfNatureUsed: 0,
    current: emptyTurnData(),
    reports: {}
  };
}

/** Mutable views of the draft (the draft is a private clone). */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function reduce(d: Mutable<GameState>, e: GameEvent): void {
  const fail = (code: "out-of-order" | "invalid", message: string): never => {
    throw new EngineError(code, message, e.seq);
  };
  const facts = d.facts as Record<string, GameState["facts"][string]>;
  const aaOf = (id: string) => (d.aa as Mutable<GameState["aa"]>)[id] ?? fail("invalid", `${id} is not an AA`);
  const factionOf = (id: string) => (d.factions as Record<string, FactionState>)[id] ?? fail("invalid", `unknown faction ${id}`);
  const cur = d.current;
  const aaTurn = (id: string) => (cur.aa[id] ??= { deals: {}, rolls: 0, vetoes: 0, writeFromRule: false });
  const adj = (id: string): AdjudicationState => cur.adjudication[id] ?? fail("invalid", `unknown action ${id}`);
  const addFact = (f: FactInput) => {
    if (facts[f.id]) fail("invalid", `fact ${f.id} already exists`);
    const v = f.visibility;
    if (v.kind === "private" && !d.factions[v.faction]) fail("invalid", `fact private to unknown faction ${v.faction}`);
    for (const t of f.tags.factions) if (!d.factions[t]) fail("invalid", `fact tagged with unknown faction ${t}`);
    for (const t of f.tags.threads) if (!d.threads[t]) fail("invalid", `fact tagged with unknown thread ${t}`);
    facts[f.id] = { ...structuredClone(f), turn: e.turn, source: e.seq, knownBy: [] };
  };
  const addAction = (a: ActionState) => {
    if (cur.actions[a.id]) fail("invalid", `action ${a.id} already exists`);
    for (const f of [a.faction, ...a.participants, ...a.targets]) factionOf(f);
    cur.actions[a.id] = structuredClone(a);
    cur.order.push(a.id);
    cur.adjudication[a.id] = { clock: {}, secrets: {} };
  };
  const inTurn = () => {
    if (!d.turnOpen) fail("out-of-order", `${e.type} needs an open turn`);
  };

  switch (e.type) {
    case "GameCreated":
      return fail("invalid", "GameCreated appears twice");

    // ---------- setup ----------

    case "StandingSet": {
      // solo_mode.qmd Part IV, Standing: every active faction, yours included, in one order.
      const active = Object.values(d.factions)
        .filter((f) => f.kind !== "background")
        .map((f) => f.id);
      const same = e.order.length === active.length && new Set(e.order).size === e.order.length && active.every((id) => e.order.includes(id));
      if (!same) fail("invalid", `standing must order exactly the active factions: ${active.join(", ")}`);
      d.standing = [...e.order];
      if (d.turnOpen) {
        cur.standingSet = true;
        cur.standingProposal = [...e.order];
      }
      return;
    }

    case "DispositionSet": {
      if (!DispositionId.safeParse(e.disposition).success) fail("invalid", `unknown disposition ${e.disposition}`);
      aaOf(e.aa).disposition = e.disposition;
      return;
    }

    case "ClockConfigured": {
      // solo_mode.qmd Part VII, The Clock: the last Escalation is the Breaking Point.
      const last = e.escalations[e.escalations.length - 1];
      if (e.length < 1 || !last?.breakingPoint || last.box !== e.length) {
        fail("invalid", "the clock needs a Breaking Point on its last box");
      }
      d.clock = { length: e.length, position: 0, escalations: e.escalations.map((x) => ({ ...x, landed: false })) };
      return;
    }

    case "FactEstablished":
      return addFact(e.fact);

    case "ThreadOpened": {
      if (d.threads[e.thread.id]) fail("invalid", `thread ${e.thread.id} already exists`);
      for (const f of e.thread.facts) if (!facts[f]) fail("invalid", `thread cites unknown fact ${f}`);
      (d.threads as Record<string, GameState["threads"][string]>)[e.thread.id] = { ...structuredClone(e.thread), opened: e.turn };
      return;
    }

    case "ThreadClosed": {
      const t = d.threads[e.thread] ?? fail("invalid", `unknown thread ${e.thread}`);
      if (t.closed !== undefined) fail("invalid", `thread ${e.thread} is already closed`);
      t.closed = e.turn;
      return;
    }

    // ---------- turn ----------

    case "GameStarted": {
      if (d.status !== "setup") fail("out-of-order", "the game has already started");
      if (d.standing.length === 0) fail("invalid", "set Standing before starting");
      if (d.clock.length === 0) fail("invalid", "configure the Crisis Clock before starting");
      d.status = "playing";
      return;
    }

    case "TurnOpened": {
      if (d.status !== "playing") fail("out-of-order", "the game is not in play");
      if (d.turnOpen) fail("out-of-order", `turn ${d.turn} is still open`);
      if (e.opens !== d.turn + 1) fail("out-of-order", `next turn is ${d.turn + 1}, not ${e.opens}`);
      // solo_mode.qmd Part IX: "The game ends at the stated turn count. No extensions."
      if (e.opens > d.turns) fail("out-of-order", `the game has ${d.turns} turns`);
      d.turn = e.opens;
      d.step = 1;
      d.turnOpen = true;
      d.current = emptyTurnData(d.standing);
      return;
    }

    case "StepAdvanced": {
      if (!d.turnOpen) fail("out-of-order", "no turn is open");
      if (e.to !== d.step + 1) fail("out-of-order", `next step is ${d.step + 1}, not ${e.to}`);
      d.step = e.to;
      return;
    }

    case "TurnClosed": {
      if (!d.turnOpen) fail("out-of-order", "no turn is open");
      if (d.step !== 8) fail("out-of-order", `turn ${d.turn} is at step ${d.step}, not 8 (the Report)`);
      // Reactor memory: who acted on each AA this turn (solo_mode.qmd Part IV, Behavior Rules).
      for (const aa of Object.values(d.aa)) {
        const affecting = cur.order
          .map((id) => cur.actions[id]!)
          .filter((a) => !a.participants.includes(aa.faction) && a.targets.includes(aa.faction));
        aa.actedUponLastTurn = affecting.length > 0;
        if (affecting.length) aa.lastAffectedBy = affecting[affecting.length - 1]!.faction;
      }
      d.turnOpen = false;
      return;
    }

    case "GameEnded": {
      if (d.status !== "playing" || d.turnOpen || d.turn !== d.turns) fail("out-of-order", `the game ends after turn ${d.turns} closes`);
      d.status = "ended";
      return;
    }

    // ---------- the Oracle ----------

    case "OracleConsulted": {
      if (e.purpose.kind === "notice") {
        inTurn();
        const n = (cur.notice[e.purpose.action] ??= { checked: false });
        n.checked = true;
        n.noticed = isYes(e.answer);
      }
      return;
    }

    // ---------- step 2 ----------

    case "OfferMade": {
      inTurn();
      aaOf(e.aa);
      if (Object.values(cur.offers).some((o) => o.aa === e.aa)) fail("invalid", `one Offer per AA per turn (${e.aa})`);
      cur.offers[e.id] = { id: e.id, aa: e.aa, terms: structuredClone(e.terms), odds: e.odds, settled: false };
      return;
    }

    case "OfferAnswered": {
      const o = cur.offers[e.id] ?? fail("invalid", `unknown offer ${e.id}`);
      o.answer = e.answer;
      o.followUp = e.followUp;
      return;
    }

    case "OfferSettled": {
      const o = cur.offers[e.id] ?? fail("invalid", `unknown offer ${e.id}`);
      if (o.settled) fail("invalid", `offer ${e.id} is already settled`);
      o.settled = true;
      o.deal = e.dealId;
      return;
    }

    case "DealStruck": {
      if (d.deals[e.deal.id]) fail("invalid", `deal ${e.deal.id} already exists`);
      for (const p of e.deal.parties) factionOf(p);
      (d.deals as Record<string, GameState["deals"][string]>)[e.deal.id] = {
        id: e.deal.id,
        parties: [...e.deal.parties],
        terms: e.deal.terms.text,
        obligations: structuredClone(e.deal.terms.obligations),
        since: e.turn,
        until: e.deal.terms.until,
        status: "active",
        joint: e.deal.terms.joint ?? false
      };
      return;
    }

    case "SignalOfferAnswered": {
      const aa = aaOf(e.aa);
      if (!aa.signalOffer) fail("invalid", `${e.aa} has no Signal Offer waiting`);
      aa.signalOffer = false;
      return;
    }

    case "DealKeepCostAnswered": {
      aaTurn(e.aa).deals[e.deal] = { ...aaTurn(e.aa).deals[e.deal], costs: e.costs };
      return;
    }

    case "DealKept": {
      if (d.aa[e.by]) aaTurn(e.by).deals[e.deal] = { ...aaTurn(e.by).deals[e.deal], kept: true };
      return;
    }

    case "DealBroken": {
      const deal = d.deals[e.deal] ?? fail("invalid", `unknown deal ${e.deal}`);
      if (deal.status !== "active") fail("invalid", `deal ${e.deal} is not active`);
      if (!deal.parties.includes(e.by)) fail("invalid", `${e.by} is not a party to ${e.deal}`);
      deal.status = "broken";
      deal.brokenBy = e.by;
      deal.brokenTurn = e.turn;
      if (d.aa[e.by]) aaTurn(e.by).deals[e.deal] = { ...aaTurn(e.by).deals[e.deal], kept: false };
      return;
    }

    case "DealEnded": {
      const deal = d.deals[e.deal] ?? fail("invalid", `unknown deal ${e.deal}`);
      if (deal.status !== "active") fail("invalid", `deal ${e.deal} is not active`);
      deal.status = "ended";
      return;
    }

    case "DispositionChanged": {
      const aa = aaOf(e.aa);
      if (aa.disposition !== e.from) fail("invalid", `${e.aa} is ${aa.disposition}, not ${e.from}`);
      aa.disposition = e.to;
      if (d.turnOpen) (cur.causes[e.aa] ??= []).push(...e.causes);
      return;
    }

    // ---------- step 3 ----------

    case "ActionDeclared": {
      inTurn();
      addAction(e.action);
      for (const p of e.action.participants) if (d.aa[p]) aaTurn(p).joint = "pending";
      return;
    }

    // ---------- step 4 ----------

    case "JointResolved": {
      const t = aaTurn(e.aa);
      t.joint = e.joined ? "joined" : "declined";
      if (!e.joined) {
        const a = cur.actions[e.action] ?? fail("invalid", `unknown action ${e.action}`);
        a.participants = a.participants.filter((p) => p !== e.aa);
      }
      return;
    }

    case "ConsolidatorThreatAnswered":
      aaTurn(e.aa).threatened = e.threatened;
      return;

    case "AAHeld": {
      const t = aaTurn(e.aa);
      t.held = e.reason;
      addAction(e.action);
      t.action = e.action.id;
      return;
    }

    case "AATableRolled": {
      const t = aaTurn(e.aa);
      t.table = { index: e.index, entry: e.entry };
      t.rolls++;
      t.target = undefined;
      return;
    }

    case "AAEntryVetoed": {
      const t = aaTurn(e.aa);
      if (!t.table) fail("invalid", `${e.aa} has no table entry to veto`);
      if (t.action) fail("out-of-order", `${e.aa}'s action is already written`);
      // solo_mode.qmd Part IV, Veto: "reroll once. If the reroll fails too, write an action from the
      // behavior rule directly." A deal reroll (refrain obligation) doesn't count as a veto.
      if (e.reason === "veto") {
        t.vetoes++;
        if (t.vetoes >= 2) t.writeFromRule = true;
      }
      t.lastReroll = e.reason;
      t.table = undefined;
      t.target = undefined;
      return;
    }

    case "TargetFilled": {
      factionOf(e.target);
      aaTurn(e.aa).target = e.target;
      const aa = aaOf(e.aa);
      if (aa.targetsPlayerNext && e.target === d.player) aa.targetsPlayerNext = false;
      return;
    }

    case "ActionAccepted": {
      inTurn();
      addAction(e.action);
      if (d.aa[e.action.faction]) aaTurn(e.action.faction).action = e.action.id;
      return;
    }

    // ---------- step 5 ----------

    case "ActionsClassified": {
      if (cur.groups) fail("invalid", "actions are already classified");
      cur.groups = e.groups.map((g) => ({ ...structuredClone(g), resolved: false }));
      return;
    }

    case "ConflictJudged": {
      const g = cur.groups?.find((x) => x.id === e.group) ?? fail("invalid", `unknown group ${e.group}`);
      g.bothCanBeTrue = e.bothCanBeTrue;
      return;
    }

    case "LeverageGraded": {
      const a = adj(e.action);
      if (a.rolled) fail("out-of-order", `${e.action} is already rolled: a grade can't change after its roll`);
      a.grade = e.grade;
      a.gradeSource = e.source;
      a.bonusInScope = e.bonusInScope;
      return;
    }

    case "DiceRolled": {
      const a = adj(e.action);
      if (a.rolled) fail("invalid", `${e.action} is already rolled`);
      a.rolled = {
        grade: e.grade,
        keep: e.keep,
        roll: structuredClone(e.roll),
        kept: e.kept,
        effective: e.effective,
        doubles: e.doubles,
        bonusEffect: e.bonusEffect
      };
      // Adaptation (solo_mode.qmd Part IV): an AA's kept die is a 6 or a 1 on an adjudication roll.
      if (e.kept === 6 || e.kept === 1) {
        for (const p of cur.actions[e.action]!.participants) {
          if (!d.aa[p]) continue;
          const owed = (cur.adaptation[p] ??= []);
          if (!owed.includes("kept-6-or-1")) owed.push("kept-6-or-1");
        }
      }
      return;
    }

    case "BonusSpent": {
      const b = factionOf(e.faction).bonuses.find((x) => x.name === e.bonus) ?? fail("invalid", `${e.faction} has no bonus ${e.bonus}`);
      if (b.usesLeft < 1) fail("invalid", `${e.bonus} has no uses left`);
      b.usesLeft--;
      return;
    }

    case "ResultBanded": {
      const a = adj(e.action);
      a.band = e.band;
      if (e.outcome === "as-rolled" || e.outcome === "prevails" || e.outcome === "worse" || e.outcome === "standoff") a.conflictOutcome = e.outcome;
      for (const g of cur.groups ?? []) if (g.actions.every((id) => cur.adjudication[id]?.band)) g.resolved = true;
      return;
    }

    case "InspirationAnswered":
      adj(e.action).inspiration = { use: e.use };
      return;

    case "InspirationRolled": {
      const a = adj(e.action);
      a.inspiration = { use: true, table: e.table, face: e.face, effect: e.effect, applied: false };
      return;
    }

    case "InspirationApplied": {
      const a = adj(e.action);
      if (!a.inspiration) fail("invalid", `no inspiration rolled for ${e.action}`);
      a.inspiration!.applied = true;
      // solo_mode.qmd Part VIII: Standing moves are proposals the player confirms in step 7 (A8).
      if (e.target && (e.effect === "rival-down" || e.effect === "rival-up") && cur.standingProposal.includes(e.target)) {
        cur.standingProposal = e.effect === "rival-down" ? moveDown(cur.standingProposal, e.target) : moveUp(cur.standingProposal, e.target);
      }
      return;
    }

    case "ForceOfNatureAnswered": {
      adj(e.action).forceOfNature = { use: e.use };
      if (e.use) d.forceOfNatureUsed++;
      return;
    }

    case "ForceOfNatureRolled":
      adj(e.action).forceOfNature = { use: true, face: e.face };
      return;

    case "ClockEffectAnswered": {
      const c = adj(e.action).clock;
      if (e.question === "addresses") c.addresses = e.yes;
      else if (e.question === "worsens") c.worsens = e.yes;
      else c.fonWorsens = e.yes;
      return;
    }

    case "ClockMoved": {
      if (e.position < 0 || e.position > d.clock.length) fail("invalid", `clock position ${e.position} out of range`);
      d.clock.position = e.position;
      if (e.reason === "turn") cur.clockAdvanced = true;
      return;
    }

    case "EscalationLanded": {
      const x = d.clock.escalations.find((y) => y.box === e.box) ?? fail("invalid", `no escalation on box ${e.box}`);
      if (x.landed) fail("invalid", `escalation ${e.box} already landed`);
      x.landed = true;
      return;
    }

    case "SecretRolled": {
      const aa = aaOf(e.aa);
      if (aa.secrets.some((s) => s.index === e.index)) fail("invalid", `${e.aa} secret ${e.index + 1} is already uncovered`);
      addFact(e.fact);
      aa.secrets.push({ index: e.index, status: e.status, knownBy: [...e.knownBy], fact: e.fact.id });
      facts[e.fact.id]!.knownBy = e.knownBy.filter((k) => !(e.fact.visibility.kind === "private" && e.fact.visibility.faction === k));
      return;
    }

    case "SecretsResolved": {
      const a = adj(e.action);
      if (e.kind === "investigation") a.secrets.investigation = true;
      else a.secrets.ownOne = true;
      return;
    }

    case "InvestigationSixAnswered":
      adj(e.action).secrets.six = e.keep;
      return;

    case "SecretConfirmed": {
      const s = aaOf(e.aa).secrets.find((x) => x.index === e.index) ?? fail("invalid", `${e.aa} secret ${e.index + 1} is not uncovered`);
      if (s.status !== "rumor") fail("invalid", `${e.aa} secret ${e.index + 1} is not a rumor`);
      s.status = "private";
      facts[s.fact]!.status = "established";
      return;
    }

    case "FactRevealed": {
      const f = facts[e.fact] ?? fail("invalid", `unknown fact ${e.fact}`);
      factionOf(e.to);
      if (!f.knownBy.includes(e.to)) f.knownBy.push(e.to);
      if (e.action) adj(e.action).secrets.revealedToAA = true;
      return;
    }

    case "OutcomeAccepted": {
      const a = adj(e.action);
      if (!a.band) fail("out-of-order", `${e.action} has no result yet`);
      if (a.outcome !== undefined) fail("invalid", `${e.action} already has an outcome`);
      for (const f of e.facts) addFact(f);
      a.outcome = e.text;
      return;
    }

    // ---------- step 6 ----------

    case "SignalRolled": {
      cur.signals[e.aa] = { face: e.face, signal: e.signal };
      if (e.signal === "offer") aaOf(e.aa).signalOffer = true;
      return;
    }

    case "ExposureAnswered": {
      const s = cur.signals[e.aa] ?? fail("invalid", `${e.aa} has no Signal this turn`);
      s.exposureAnswered = true;
      return;
    }

    case "InterestedAnswered": {
      const n = cur.notice[e.action] ?? fail("invalid", `${e.action} has no notice check`);
      n.interested = [...e.aas];
      return;
    }

    case "CovertNoticed": {
      const n = cur.notice[e.action] ?? fail("invalid", `${e.action} has no notice check`);
      n.by = e.by;
      aaOf(e.by).targetsPlayerNext = true;
      return;
    }

    // ---------- step 7 ----------

    case "DispositionCausesAnswered":
      if (cur.dispositionAnswered.includes(e.aa)) fail("invalid", `${e.aa}'s disposition is already updated`);
      cur.dispositionAnswered.push(e.aa);
      return;

    case "TableEntryRewritten": {
      const aa = aaOf(e.aa);
      if (e.index < 0 || e.index > 5) fail("invalid", `table index ${e.index} out of range`);
      aa.actionTable[e.index] = e.text;
      const owed = cur.adaptation[e.aa] ?? [];
      const i = owed.indexOf(e.trigger);
      if (i >= 0) owed.splice(i, 1);
      return;
    }

    case "ObjectiveChanged": {
      aaOf(e.aa).objective = e.objective;
      if (d.turnOpen) (cur.adaptation[e.aa] ??= []).push(e.reason === "achieved" ? "objective-achieved" : "objective-impossible");
      return;
    }

    case "BehaviorRerolled":
      aaOf(e.aa).behavior = e.behavior;
      return;

    // ---------- step 8 ----------

    case "ReportPublished": {
      inTurn();
      if (cur.reported) fail("invalid", `turn ${d.turn}'s Report is already published`);
      (d.reports as Record<number, GameState["reports"][number]>)[d.turn] = structuredClone(e.report);
      for (const t of e.threads) {
        if (d.threads[t.id]) fail("invalid", `thread ${t.id} already exists`);
        (d.threads as Record<string, GameState["threads"][string]>)[t.id] = { ...structuredClone(t), opened: e.turn };
      }
      cur.reported = true;
      return;
    }

    default: {
      const unknown: never = e;
      return fail("invalid", `unknown event ${(unknown as GameEvent).type}`);
    }
  }
}
