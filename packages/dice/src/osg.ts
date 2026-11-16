import { rollDie } from "./rng";
import type { D66Roll, KeptRoll, Rng } from "./types";

/** One d6. */
export function rollD6(rng: Rng): number {
  return rollDie(6, rng);
}

/** 2d6, keeping the higher or the lower die.
 * contested_ground.qmd Part IV, The Dice Mechanic (Strong keeps high, Weak keeps low);
 * solo_mode.qmd Part III, Asking (Likely keeps high, Unlikely keeps low). */
export function roll2d6Keep(keep: "high" | "low", rng: Rng): KeptRoll {
  const first = rollD6(rng);
  const second = rollD6(rng);
  const kept = keep === "high" ? Math.max(first, second) : Math.min(first, second);
  return { dice: [first, second], kept, doubles: first === second };
}

/** d66: the first die is the tens, the second the units.
 * solo_mode.qmd Appendix C, Reading d66. */
export function rollD66(rng: Rng): D66Roll {
  const tens = rollD6(rng);
  const units = rollD6(rng);
  return { tens, units, value: tens * 10 + units };
}
