import type { BehaviorId, DispositionId } from "../types";
import { keepOdds, type KeepOdds } from "./disposition";

/** solo_mode.qmd Part V, Deals: "When keeping a deal would cost the AA something real this turn, or
 * every turn for a Schemer, ask: Does [AA] keep the deal?" For a Schemer the answer to
 * `costsSomethingReal` is not asked (upstream 0d96334, Appendix B). */
export function needsKeepCheck(behavior: BehaviorId, costsSomethingReal: boolean): boolean {
  return behavior === "schemer" || costsSomethingReal;
}

/** Odds for "Does [AA] keep the deal?", from its disposition. */
export function dealKeepOdds(disposition: DispositionId, behavior: BehaviorId): KeepOdds {
  return keepOdds(disposition, behavior);
}

/** solo_mode.qmd Part V, Deals: "If you break a deal, its disposition drops by 2." */
export const PLAYER_BREAK_DELTA = -2;

/** solo_mode.qmd Part V, Joint Actions with an AA: "Does [AA] confirm?" Likely; Allied confirms
 * without rolling. */
export function jointConfirmOdds(disposition: DispositionId): "automatic" | "likely" {
  return disposition === "allied" ? "automatic" : "likely";
}

export type Obligation = { kind: "act"; description: string } | { kind: "refrain"; description: string };

/** solo_mode.qmd Part V, Deals: "Obligations replace the table. If a deal requires the AA to act
 * this turn, that is its action; do not roll its table." */
export function obligationReplacesTable(obligations: readonly Obligation[]): Obligation | undefined {
  return obligations.find((o) => o.kind === "act");
}
