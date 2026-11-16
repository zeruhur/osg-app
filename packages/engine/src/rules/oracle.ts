import { rollD6, roll2d6Keep, rollDie, type Rng } from "@osg/dice";
import { core, faceRow } from "@osg/rules-data";
import type { Answer, OracleOdds } from "../types";

/** solo_mode.qmd Part III, Asking: Likely 2d6 keep the higher, Even 1d6, Unlikely 2d6 keep the lower. */
export function oracleRoll(odds: OracleOdds): { dice: 1 } | { dice: 2; keep: "high" | "low" } {
  const row = core.oracleOdds.rows.find((r) => r.id === odds);
  if (!row) throw new RangeError(`unknown odds ${odds}`);
  return row.roll;
}

/** solo_mode.qmd Part III, Asking: 6 Yes-and, 5 Yes, 4 Yes-but, 3 No-but, 2 No, 1 No-and. */
export function oracleAnswer(face: number): Answer {
  return faceRow(core.oracleAnswers.rows, face).id;
}

export function isYes(answer: Answer): boolean {
  return answer === "yes-and" || answer === "yes" || answer === "yes-but";
}

export interface OracleResult {
  faces: number[];
  kept: number;
  answer: Answer;
}

/** Reads given dice at the given odds. Doubles mean nothing on an Oracle roll
 * (solo_mode.qmd Part III, Oracle Discipline). */
export function readOracle(odds: OracleOdds, faces: readonly number[]): OracleResult {
  const roll = oracleRoll(odds);
  if (faces.length !== roll.dice) throw new RangeError(`${odds} rolls ${roll.dice} dice, got ${faces.length}`);
  const kept = roll.dice === 1 ? faces[0]! : roll.keep === "high" ? Math.max(...faces) : Math.min(...faces);
  return { faces: [...faces], kept, answer: oracleAnswer(kept) };
}

/** Asks the Oracle: rolls at the odds and reads the answer. */
export function askOracle(odds: OracleOdds, rng: Rng): OracleResult {
  const roll = oracleRoll(odds);
  const faces = roll.dice === 1 ? [rollD6(rng)] : [...roll2d6Keep(roll.keep, rng).dice];
  return readOracle(odds, faces);
}

/** solo_mode.qmd Part III, Open Questions: "Which faction? Number the factions involved and roll."
 * Also "Which thread?". Uniform over the candidates, in the order given. */
export function rollWhich<T>(candidates: readonly T[], rng: Rng): { index: number; face: number; value: T } {
  if (candidates.length === 0) throw new RangeError("nothing to choose from");
  const face = rollDie(candidates.length, rng);
  return { index: face - 1, face, value: candidates[face - 1]! };
}
