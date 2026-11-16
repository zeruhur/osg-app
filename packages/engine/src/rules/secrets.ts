import { rollD6, type Rng } from "@osg/dice";
import type { Band } from "../types";

// solo_mode.qmd Part VI, Secrets.

export type SecretStatus = "private" | "rumor" | "public";

/** "You investigate it and succeed. On a 4-5, the secret is yours, privately. On a 6, roll twice
 * and keep both, or keep one and gain a crumb on another faction. On a 2-3, it is a rumor."
 * A 1 uncovers nothing for the investigator. */
export type InvestigationResult =
  | { rolls: 1; status: "private" }
  | { rolls: 1; status: "rumor" }
  /** The player chooses: keep both, or keep one and gain a crumb on another faction. */
  | { rolls: 2; status: "private"; orOnePlusCrumb: true }
  | { rolls: 0 };

export function investigationResult(band: Band): InvestigationResult {
  switch (band) {
    case "especially-good":
      return { rolls: 2, status: "private", orOnePlusCrumb: true };
    case "success":
      return { rolls: 1, status: "private" };
    case "worse":
      return { rolls: 1, status: "rumor" };
    case "especially-bad":
      return { rolls: 0 };
  }
}

/** "It rolls a 1 on any adjudication. The secret comes out publicly in the Report." */
export function ownOneRevealsSecret(kept: number): boolean {
  return kept === 1;
}

/** Rolls a Secret Table entry (0-based index), rerolling entries already uncovered ("Cross it off;
 * reroll duplicates"). Returns undefined, rolling nothing, when all six are uncovered. */
export function rollSecret(rng: Rng, uncovered: readonly number[]): { index: number; faces: number[] } | undefined {
  if (new Set(uncovered).size >= 6) return undefined;
  const faces: number[] = [];
  for (;;) {
    const face = rollD6(rng);
    faces.push(face);
    if (!uncovered.includes(face - 1)) return { index: face - 1, faces };
  }
}
