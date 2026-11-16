import type { Rng } from "@osg/dice";
import { execute, type Command } from "../src/commands";
import { nextRequired, type Decision } from "../src/turn";
import type { GameState } from "../src/types";
import { packs } from "@osg/rules-data";
import type { EventBody, GameEvent } from "../src/events";
import { fold } from "../src/fold";
import { setupGame, type SetupOptions } from "../src/setup";
import type { Author } from "../src/types";

export const corentine = packs.corentine!;

/** The Appendix B game: lighter variant, playing Essaveth. */
export function appendixBSetup(overrides: Partial<SetupOptions> = {}): GameEvent[] {
  return setupGame(corentine, { variant: "lighter", player: "essaveth", seed: "appendix-b", ...overrides });
}

/** Appends bodies to a log, stamping seq, turn and step from the state they apply to. */
export function append(log: GameEvent[], bodies: EventBody[], author: Author = "engine"): GameEvent[] {
  const out = [...log];
  for (const body of bodies) {
    const s = fold(out);
    out.push({ ...body, seq: s.nextSeq, turn: s.turn, step: s.step, author } as GameEvent);
  }
  fold(out); // validates the last event too
  return out;
}

/** A full pass through one turn's step markers (no step content yet: that arrives in step 7). */
export function emptyTurn(turn: number): EventBody[] {
  return [
    { type: "TurnOpened", opens: turn },
    ...([2, 3, 4, 5, 6, 7, 8] as const).map((to): EventBody => ({ type: "StepAdvanced", to })),
    { type: "TurnClosed" }
  ];
}

/** Deep-freezes a value so a test fails if anything mutates it. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}


/** A game driven by commands, keeping its log, for tests. */
export class Game {
  readonly log: GameEvent[];
  state: GameState;
  constructor(
    log: GameEvent[],
    public rng?: Rng
  ) {
    this.log = [...log];
    this.state = fold(this.log);
  }

  do(command: Command, author?: Author): GameEvent[] {
    const r = execute(this.state, command, { ...(this.rng ? { rng: this.rng } : {}), ...(author ? { author } : {}) });
    this.log.push(...r.events);
    this.state = r.state;
    return r.events;
  }

  decisions(): Decision[] {
    return nextRequired(this.state).decisions;
  }

  kinds(): string[] {
    return this.decisions().map((d) => d.kind);
  }
}
