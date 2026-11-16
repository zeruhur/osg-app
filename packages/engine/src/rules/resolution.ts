import { core, rangeRow } from "@osg/rules-data";
import type { Band, Grade } from "../types";

export type Keep = "high" | "low";
export type BonusEffect = "weak-to-strong" | "4-5-to-6" | "no-effect";

/** contested_ground.qmd Part IV, The Dice Mechanic: Strong keeps the higher die, Weak the lower. */
export function keepFor(grade: Grade): Keep {
  return grade === "strong" ? "high" : "low";
}

/** contested_ground.qmd Part IV, The Dice Mechanic: 6 / 4-5 / 2-3 / 1. */
export function band(result: number): Band {
  return rangeRow(core.results.rows, result).id;
}

/** Does the band give the desired outcome? (4+; contested_ground.qmd Part IV) */
export function succeeds(b: Band): boolean {
  return b === "especially-good" || b === "success";
}

/** Which die to keep for an opposed action, bonus included: a declared bonus on a Weak action
 * makes it Strong (contested_ground.qmd Part VII, Spending a bonus). */
export function keepForAction(grade: Grade, bonus: boolean): Keep {
  return grade === "weak" && bonus ? "high" : keepFor(grade);
}

export interface RollReading {
  keep: Keep;
  kept: number;
  /** The result after the bonus: what is banded and compared in a conflict. */
  effective: number;
  band: Band;
  doubles: boolean;
  /** Present when a bonus was declared: it is spent whatever its effect. */
  bonusEffect?: BonusEffect | undefined;
}

/** Reads an opposed action's 2d6 roll.
 * contested_ground.qmd Part VII, Spending a bonus: "If the action is graded Weak, the bonus makes
 * it Strong. If it is already Strong, a kept 4 or 5 becomes a 6 instead; a 1-3 is unchanged, and
 * the bonus is spent anyway. In an action in conflict, the improved result counts as a 6."
 * A Strong roll that already kept a 6 is unchanged (ambiguity A6 in docs/phase-1-engine.md). */
export function readRoll(grade: Grade, bonus: boolean, dice: readonly [number, number]): RollReading {
  const keep = keepForAction(grade, bonus);
  const kept = keep === "high" ? Math.max(...dice) : Math.min(...dice);
  let effective = kept;
  let bonusEffect: BonusEffect | undefined;
  if (bonus) {
    if (grade === "weak") bonusEffect = "weak-to-strong";
    else if (kept === 4 || kept === 5) {
      bonusEffect = "4-5-to-6";
      effective = 6;
    } else bonusEffect = "no-effect";
  }
  return { keep, kept, effective, band: band(effective), doubles: dice[0] === dice[1], bonusEffect };
}

export type ConflictOutcome = "as-rolled" | "prevails" | "worse" | "standoff";

export interface ConflictReading {
  id: string;
  outcome: ConflictOutcome;
  /** The band to read the outcome by. */
  band: Band;
}

/** contested_ground.qmd Part IV, Actions in Conflict.
 * - If both outcomes can be true at once (two actions only, ambiguity A7), both are read as rolled.
 * - Otherwise the highest effective result prevails and is read normally; everyone else's outcome
 *   is worse than desired, whatever its die showed, and on a 1 something especially bad may also
 *   occur.
 * - A tie at the top is a standoff among the tied: all of them are worse than desired. */
export function resolveConflict(
  entries: readonly { id: string; effective: number }[],
  bothCanBeTrue = false
): ConflictReading[] {
  if (entries.length < 2) throw new RangeError("a conflict needs at least two actions");
  if (bothCanBeTrue) {
    if (entries.length !== 2) throw new RangeError("'both can be true' applies to two actions only");
    return entries.map((e) => ({ id: e.id, outcome: "as-rolled", band: band(e.effective) }));
  }
  const top = Math.max(...entries.map((e) => e.effective));
  const tied = entries.filter((e) => e.effective === top).length;
  const losing = (effective: number): Band => (effective === 1 ? "especially-bad" : "worse");
  return entries.map((e) => {
    if (e.effective !== top) return { id: e.id, outcome: "worse", band: losing(e.effective) };
    if (tied > 1) return { id: e.id, outcome: "standoff", band: losing(e.effective) };
    return { id: e.id, outcome: "prevails", band: band(e.effective) };
  });
}

/** contested_ground.qmd Part IV, Force of Nature: on doubles, "Once or twice per game." */
export const FORCE_OF_NATURE_PER_GAME = 2;

export function forceOfNatureAvailable(doubles: boolean, usedSoFar: number): boolean {
  return doubles && usedSoFar < FORCE_OF_NATURE_PER_GAME;
}
