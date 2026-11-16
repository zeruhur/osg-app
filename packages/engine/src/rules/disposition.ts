import { disposition as table } from "@osg/rules-data";
import type { BehaviorId, DispositionId } from "../types";

/** solo_mode.qmd Part V, Disposition: Hostile → Wary → Neutral → Open → Allied. */
export const SCALE: readonly DispositionId[] = table.scale;

export function dispositionIndex(d: DispositionId): number {
  return SCALE.indexOf(d);
}

/** Moves disposition by `delta` steps. "Disposition never moves past Hostile or Allied." */
export function shiftDisposition(d: DispositionId, delta: number): DispositionId {
  const i = Math.min(SCALE.length - 1, Math.max(0, dispositionIndex(d) + delta));
  return SCALE[i]!;
}

/** The end-of-turn causes (solo_mode.qmd Part V, Moving disposition). Each applies at most once
 * per turn, so they are flags, not counts. */
export interface DispositionCauses {
  /** +1: you kept a deal with it, or your action clearly benefited it. */
  keptDealOrBenefited?: boolean;
  /** −1: your action harmed it (even as a side effect), or it uncovered a covert action of yours
   * aimed at it. */
  harmedOrUncoveredCovert?: boolean;
  /** −2: you broke a deal with it. */
  brokeDeal?: boolean;
}

export function causesDelta(c: DispositionCauses): number {
  return (c.keptDealOrBenefited ? 1 : 0) - (c.harmedOrUncoveredCovert ? 1 : 0) - (c.brokeDeal ? 2 : 0);
}

/** Applies the turn's causes, then clamps. */
export function applyCauses(d: DispositionId, c: DispositionCauses): DispositionId {
  return shiftDisposition(d, causesDelta(c));
}

/** solo_mode.qmd Part V, Disposition: "Wary if its objectives conflict with yours, Open if they
 * align, Neutral otherwise." */
export function startingDisposition(objectives: "conflict" | "align" | "neither"): DispositionId {
  return objectives === "conflict" ? "wary" : objectives === "align" ? "open" : "neutral";
}

export type KeepOdds = "automatic" | "likely" | "even" | "unlikely";

/** Odds that an AA keeps a deal, from the Disposition table's "Keeping deals" column.
 * Allied keeps without a roll, except a Schemer (Likely).
 * Hostile is "n/a" in the table, yet a Hostile AA can hold a deal (an Offer that served its
 * objective at Unlikely odds, or a deal struck before it turned Hostile). The engine uses Unlikely,
 * one step below Wary (ambiguity A9 in docs/phase-1-engine.md). */
export function keepOdds(d: DispositionId, behavior: BehaviorId): KeepOdds {
  const row = table.rows.find((r) => r.id === d)!;
  const odds = behavior === "schemer" && row.schemerKeepOdds ? row.schemerKeepOdds : row.keepOdds;
  return odds === "none" ? "unlikely" : odds;
}
