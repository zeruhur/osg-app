import { createRng } from "@osg/dice";
import { execute, fold, nextRequired, setupGame, type Command, type GameEvent, type GameState } from "@osg/engine";
import { packs } from "@osg/rules-data";
import { DEFAULT_POLICY, answer, optionalMoves, type PolicyOptions } from "./policy";

export interface GameOptions {
  pack: string;
  variant?: string;
  player: string;
  turns?: number;
  policy?: Partial<PolicyOptions>;
}

export interface PlayedGame {
  seed: string;
  log: GameEvent[];
  state: GameState;
}

/** Plays one game to the end. Game dice come from the engine's Rng (seeded by `seed`); the
 * policy's choices from a separate Rng, so policy changes never shift the game's dice. */
export function playGame(seed: string, options: GameOptions): PlayedGame {
  const pack = packs[options.pack];
  if (!pack) throw new Error(`unknown pack ${options.pack}`);
  const policy = { ...DEFAULT_POLICY, ...options.policy };
  const policyRng = createRng(`${seed}/policy`);
  const log = setupGame(pack, {
    seed,
    player: options.player,
    ...(options.variant ? { variant: options.variant } : {}),
    ...(options.turns ? { turns: options.turns } : {})
  });
  let state = fold(log);
  let stepDone = -1;

  const run = (command: Command) => {
    try {
      const out = execute(state, command);
      log.push(...out.events);
      state = out.state;
    } catch (e) {
      throw new Error(`game ${seed}, turn ${state.turn}, step ${state.step}, ${command.type}: ${(e as Error).message}`, { cause: e });
    }
  };

  for (let guard = 0; guard < 100_000; guard++) {
    if (state.status === "ended") return { seed, log, state };
    const r = nextRequired(state);
    if (r.decisions.length) {
      run(answer(state, r.decisions[0]!, policyRng, policy));
      continue;
    }
    if (!r.canAdvance) throw new Error(`game ${seed} stuck at turn ${state.turn}, step ${state.step}`);
    // Before leaving a step, the policy may make optional moves (Offers at step 2), once per step.
    const key = state.turn * 10 + state.step;
    if (stepDone !== key) {
      stepDone = key;
      const moves = optionalMoves(state, policyRng, policy);
      if (moves.length) {
        for (const m of moves) run(m);
        continue;
      }
    }
    run({ type: "advance" });
  }
  throw new Error(`game ${seed} did not end`);
}
