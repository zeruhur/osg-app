import { DispositionId } from "@osg/rules-data";
import { EngineError } from "./errors";
import type { EventOf, GameEvent } from "./events";
import type { FactionState, GameState } from "./types";

/** Rebuilds the game from its log. The only way to get a `GameState`. */
export function fold(events: readonly GameEvent[]): GameState {
  let state: GameState | undefined;
  for (const event of events) state = applyEvent(state, event);
  if (!state) throw new EngineError("no-game", "empty event log");
  return state;
}

/** Applies one event. Pure: never mutates `state` or `event`; returns a new state. Throws an
 * `EngineError` if the event can't apply (see errors.ts). */
export function applyEvent(state: GameState | undefined, event: GameEvent): GameState {
  if (!state) {
    if (event.type !== "GameCreated") throw new EngineError("no-game", `first event is ${event.type}, not GameCreated`, event.seq);
    if (event.seq !== 0) throw new EngineError("bad-sequence", `GameCreated must be seq 0`, event.seq);
    return created(event);
  }
  if (event.seq !== state.nextSeq) {
    throw new EngineError("bad-sequence", `expected seq ${state.nextSeq}, got ${event.seq}`, event.seq);
  }
  const next = reduce(state, event);
  return { ...next, nextSeq: state.nextSeq + 1 };
}

function created(e: EventOf<"GameCreated">): GameState {
  const factions: Record<string, FactionState> = {};
  for (const f of e.scenario.factions) {
    factions[f.id] = { ...f, bonuses: f.bonuses.map((b) => ({ ...b, usesLeft: b.uses })) };
  }
  const aa: GameState["aa"] = Object.fromEntries(
    e.scenario.aas.map((a) => [a.faction, { ...a, disposition: "neutral" as const }])
  );
  if (factions[e.player]?.kind !== "player") {
    throw new EngineError("invalid", `player faction ${e.player} is not the scenario's player faction`, e.seq);
  }
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
    scenario: e.scenario,
    factions,
    aa,
    standing: [],
    clock: { length: 0, position: 0, escalations: [] },
    facts: {},
    threads: {}
  };
}

function reduce(s: GameState, e: GameEvent): GameState {
  const fail = (code: "out-of-order" | "invalid", message: string): never => {
    throw new EngineError(code, message, e.seq);
  };

  switch (e.type) {
    case "GameCreated":
      return fail("invalid", "GameCreated appears twice");

    case "StandingSet": {
      // solo_mode.qmd Part IV, Standing: every active faction, yours included, in one order.
      const active = Object.values(s.factions)
        .filter((f) => f.kind !== "background")
        .map((f) => f.id);
      const same = e.order.length === active.length && active.every((id) => e.order.includes(id));
      if (!same) fail("invalid", `standing must order exactly the active factions: ${active.join(", ")}`);
      return { ...s, standing: [...e.order] };
    }

    case "DispositionSet": {
      const aa = s.aa[e.aa];
      if (!aa) return fail("invalid", `${e.aa} is not an AA`);
      if (!DispositionId.safeParse(e.disposition).success) fail("invalid", `unknown disposition ${e.disposition}`);
      return { ...s, aa: { ...s.aa, [e.aa]: { ...aa, disposition: e.disposition } } };
    }

    case "ClockConfigured": {
      // solo_mode.qmd Part VII, The Clock: the last Escalation is the Breaking Point.
      const last = e.escalations[e.escalations.length - 1];
      if (e.length < 1 || !last?.breakingPoint || last.box !== e.length) {
        fail("invalid", "the clock needs a Breaking Point on its last box");
      }
      return {
        ...s,
        clock: { length: e.length, position: 0, escalations: e.escalations.map((x) => ({ ...x, landed: false })) }
      };
    }

    case "FactEstablished": {
      if (s.facts[e.fact.id]) fail("invalid", `fact ${e.fact.id} already exists`);
      const v = e.fact.visibility;
      if (v.kind === "private" && !s.factions[v.faction]) fail("invalid", `fact private to unknown faction ${v.faction}`);
      for (const f of e.fact.tags.factions) if (!s.factions[f]) fail("invalid", `fact tagged with unknown faction ${f}`);
      for (const t of e.fact.tags.threads) if (!s.threads[t]) fail("invalid", `fact tagged with unknown thread ${t}`);
      return {
        ...s,
        facts: { ...s.facts, [e.fact.id]: { ...e.fact, tags: { ...e.fact.tags }, turn: e.turn, source: e.seq } }
      };
    }

    case "ThreadOpened": {
      if (s.threads[e.thread.id]) fail("invalid", `thread ${e.thread.id} already exists`);
      for (const f of e.thread.facts) if (!s.facts[f]) fail("invalid", `thread cites unknown fact ${f}`);
      return { ...s, threads: { ...s.threads, [e.thread.id]: { ...e.thread, facts: [...e.thread.facts], opened: e.turn } } };
    }

    case "ThreadClosed": {
      const t = s.threads[e.thread];
      if (!t) return fail("invalid", `unknown thread ${e.thread}`);
      if (t.closed !== undefined) fail("invalid", `thread ${e.thread} is already closed`);
      return { ...s, threads: { ...s.threads, [e.thread]: { ...t, closed: e.turn } } };
    }

    case "GameStarted": {
      if (s.status !== "setup") fail("out-of-order", "the game has already started");
      if (s.standing.length === 0) fail("invalid", "set Standing before starting");
      if (s.clock.length === 0) fail("invalid", "configure the Crisis Clock before starting");
      return { ...s, status: "playing" };
    }

    case "TurnOpened": {
      if (s.status !== "playing") fail("out-of-order", "the game is not in play");
      if (s.turnOpen) fail("out-of-order", `turn ${s.turn} is still open`);
      if (e.opens !== s.turn + 1) fail("out-of-order", `next turn is ${s.turn + 1}, not ${e.opens}`);
      // solo_mode.qmd Part IX: "The game ends at the stated turn count. No extensions."
      if (e.opens > s.turns) fail("out-of-order", `the game has ${s.turns} turns`);
      return { ...s, turn: e.opens, step: 1, turnOpen: true };
    }

    case "StepAdvanced": {
      if (!s.turnOpen) fail("out-of-order", "no turn is open");
      if (e.to !== s.step + 1) fail("out-of-order", `next step is ${s.step + 1}, not ${e.to}`);
      return { ...s, step: e.to };
    }

    case "TurnClosed": {
      if (!s.turnOpen) fail("out-of-order", "no turn is open");
      if (s.step !== 8) fail("out-of-order", `turn ${s.turn} is at step ${s.step}, not 8 (the Report)`);
      return { ...s, turnOpen: false };
    }

    case "GameEnded": {
      if (s.status !== "playing" || s.turnOpen || s.turn !== s.turns) {
        fail("out-of-order", `the game ends after turn ${s.turns} closes`);
      }
      return { ...s, status: "ended" };
    }

    default: {
      const unknown: never = e;
      return fail("invalid", `unknown event ${(unknown as GameEvent).type}`);
    }
  }
}
