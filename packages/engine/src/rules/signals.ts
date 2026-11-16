import { rollD6, type Rng } from "@osg/dice";
import { rangeRow, signals } from "@osg/rules-data";
import type { Leverage } from "../types";

export type SignalId = "silence" | "warning" | "offer" | "exposure" | "windfall";

/** solo_mode.qmd Part V, Signals: 1-2 Silence, 3 Warning, 4 Offer, 5 Exposure, 6 Windfall. */
export function signalFor(face: number): SignalId {
  return rangeRow(signals.rows, face).id;
}

export function rollSignal(rng: Rng): { face: number; signal: SignalId } {
  const face = rollD6(rng);
  return { face, signal: signalFor(face) };
}

const informational = (l: Leverage) => l.primary === "informational" || l.secondary === "informational";

/** solo_mode.qmd Part VI, Your Own Secrets: "Is it noticed?" Unlikely; Even if any AA has
 * Informational leverage (primary or secondary) or the action targeted an AA. */
export function noticeOdds(input: { aaLeverage: readonly Leverage[]; targetedAnAA: boolean }): "unlikely" | "even" {
  return input.targetedAnAA || input.aaLeverage.some(informational) ? "even" : "unlikely";
}
