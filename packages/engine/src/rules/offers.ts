import type { Answer, DispositionId, OfferOdds } from "../types";

/** The Offer ladder (solo_mode.qmd Part V, Making an Offer): "Refused → Unlikely → Even → Likely →
 * Accepted. Past Likely, it accepts without rolling; past Unlikely, it refuses." */
export const OFFER_LADDER: readonly OfferOdds[] = ["refused", "unlikely", "even", "likely", "accepted"];

/** The player's judgment about the deal: the `offerFit` decision point. */
export interface OfferFit {
  /** Better: the deal clearly advances its objective. */
  advancesObjective: boolean;
  /** Worse: the deal costs it something its behavior rule protects, or helps its rival. */
  costsProtectedOrHelpsRival: boolean;
}

export interface OfferOddsResult {
  odds: OfferOdds;
  /** Why, step by step, for the log and the UI. */
  steps: string[];
}

/** solo_mode.qmd Part V, Making an Offer, and the Disposition table's Offers column. */
export function offerOdds(disposition: DispositionId, fit: OfferFit): OfferOddsResult {
  // Hostile: "Refuses unless the deal serves its objective; then Unlikely". Other shifts don't
  // apply (ambiguity A3).
  if (disposition === "hostile") {
    return fit.advancesObjective
      ? { odds: "unlikely", steps: ["Hostile, but the deal serves its objective: Unlikely"] }
      : { odds: "refused", steps: ["Hostile: refuses"] };
  }
  // Allied: "accepts without rolling if the deal serves its objective".
  if (disposition === "allied" && fit.advancesObjective) {
    return { odds: "accepted", steps: ["Allied and the deal serves its objective: accepts without rolling"] };
  }
  let i = OFFER_LADDER.indexOf("even");
  const steps = ["Start at Even"];
  if (fit.advancesObjective) {
    i++;
    steps.push("Better: advances its objective");
  }
  if (disposition === "open" || disposition === "allied") {
    i++;
    steps.push(`Better: ${disposition}`);
  }
  if (fit.costsProtectedOrHelpsRival) {
    i--;
    steps.push("Worse: costs what its rule protects, or helps its rival");
  }
  if (disposition === "wary") {
    i--;
    steps.push("Worse: wary");
  }
  const odds = OFFER_LADDER[Math.min(OFFER_LADDER.length - 1, Math.max(0, i))]!;
  return { odds, steps };
}

/** What an Offer's Oracle answer means (solo_mode.qmd Part V, Making an Offer, results table). */
export type OfferFollowUp =
  /** Yes-and: accepts, and adds information, extra help, or +1 disposition (the player picks). */
  | "accept-and-add"
  | "accept"
  /** Yes-but: accepts on one added condition; take it or walk away. */
  | "accept-on-condition"
  /** No-but: refuses, but says what it would accept instead. */
  | "refuse-with-counter"
  | "refuse"
  /** No-and: refuses and takes offense (−1 disposition), or leaks the offer to a rival (a crumb). */
  | "refuse-and-offend-or-leak";

export function offerFollowUp(answer: Answer): OfferFollowUp {
  switch (answer) {
    case "yes-and":
      return "accept-and-add";
    case "yes":
      return "accept";
    case "yes-but":
      return "accept-on-condition";
    case "no-but":
      return "refuse-with-counter";
    case "no":
      return "refuse";
    case "no-and":
      return "refuse-and-offend-or-leak";
  }
}

/** solo_mode.qmd Part V, Signals: refusing a Signal Offer from an Open or Allied AA costs −1. */
export function signalOfferRefusalDelta(disposition: DispositionId): number {
  return disposition === "open" || disposition === "allied" ? -1 : 0;
}
