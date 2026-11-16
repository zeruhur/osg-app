import type { BehaviorId, DispositionId, FactionId, Grade } from "../types";

// solo_mode.qmd Part IV, Autonomous Actors.

export type HoldResult =
  | { holds: false }
  | { holds: true; reason: string }
  /** A Consolidator holds only if it has nothing to defend: a judgment (decision point). */
  | { needs: "consolidatorThreat" };

export interface HoldInput {
  behavior: BehaviorId;
  turn: number;
  /** Did any faction act on it last turn? (Reactor) */
  actedUponLastTurn: boolean;
  /** The answer to the `consolidatorThreat` decision point: did a faction threaten it in the last
   * Report? Undefined until asked. */
  threatenedInLastReport?: boolean | undefined;
}

/** Behavior Rules + Holding: "When its rule says an AA holds (a Reactor not acted upon last turn,
 * a Schemer on an even turn, a Consolidator with nothing to defend), skip its table."
 * Only consulted when no deal obligation replaces its action (Part X, step 4). */
export function holds(input: HoldInput): HoldResult {
  switch (input.behavior) {
    case "consolidator":
      if (input.threatenedInLastReport === undefined) return { needs: "consolidatorThreat" };
      return input.threatenedInLastReport ? { holds: false } : { holds: true, reason: "Consolidator with nothing to defend" };
    case "reactor":
      return input.actedUponLastTurn ? { holds: false } : { holds: true, reason: "Reactor not acted upon last turn" };
    case "schemer":
      return input.turn % 2 === 0 ? { holds: true, reason: "Schemer on an even turn" } : { holds: false };
    case "aggressor": // "Never holds two turns running": it has no hold condition of its own (A2).
    case "opportunist":
    case "balancer":
      return { holds: false };
  }
}

/** The target a behavior rule names, if it names one. Opportunist: the faction lowest on Standing;
 * Balancer: the highest; Reactor: the faction that last affected it.
 * "An AA never targets itself. If its rule points at itself, take the next faction" in from that end
 * of the list (ambiguity A10: the rules text says "down (Opportunist) or up (Balancer)"). */
export function ruleTarget(
  behavior: BehaviorId,
  self: FactionId,
  standing: readonly FactionId[],
  lastAffectedBy?: FactionId
): FactionId | undefined {
  switch (behavior) {
    case "opportunist":
      return [...standing].reverse().find((f) => f !== self);
    case "balancer":
      return standing.find((f) => f !== self);
    case "reactor":
      return lastAffectedBy !== undefined && lastAffectedBy !== self ? lastAffectedBy : undefined;
    default:
      return undefined;
  }
}

export interface TargetInput {
  self: FactionId;
  behavior: BehaviorId;
  /** Its disposition toward the player. */
  disposition: DispositionId;
  player: FactionId;
  standing: readonly FactionId[];
  lastAffectedBy?: FactionId | undefined;
  /** It noticed a covert action of yours: "its next [target] is you" (Part VI, Your Own Secrets). */
  forcedOnPlayer?: boolean | undefined;
}

export type TargetResult =
  | { kind: "filled"; target: FactionId; reason: string }
  /** "The faction most in the way of the AA's objective": a judgment (the `targetChoice` decision
   * point). `prefer`/`avoid` settle a tie between equal candidates. */
  | { kind: "choose"; candidates: FactionId[]; prefer?: FactionId | undefined; avoid?: FactionId | undefined };

/** The Action Table, Filling [target], with the Disposition table's Targeting column. */
export function fillTarget(input: TargetInput): TargetResult {
  const { self, player, disposition } = input;
  if (input.forcedOnPlayer && self !== player) return { kind: "filled", target: player, reason: "it noticed your covert action" };

  const named = ruleTarget(input.behavior, self, input.standing, input.lastAffectedBy);
  if (named !== undefined) return { kind: "filled", target: named, reason: `${input.behavior} rule` };

  // Hostile: "Picks you whenever its rule allows a choice."
  if (disposition === "hostile") return { kind: "filled", target: player, reason: "hostile: picks you" };

  const others = input.standing.filter((f) => f !== self);
  switch (disposition) {
    case "allied": // "Never targets you unless its rule forces it."
      return { kind: "choose", candidates: others.filter((f) => f !== player) };
    case "wary": // "Picks you between equal candidates."
      return { kind: "choose", candidates: others, prefer: player };
    case "open": // "Does not pick you between equal candidates."
      return { kind: "choose", candidates: others, avoid: player };
    default:
      return { kind: "choose", candidates: others };
  }
}

/** Veto: "reroll once. If the reroll fails too, write an action from the behavior rule directly." */
export function afterVeto(alreadyRerolled: boolean): "reroll" | "write-from-rule" {
  return alreadyRerolled ? "write-from-rule" : "reroll";
}

/** Bonuses: "An AA with a bonus spends it the first time it acts within the bonus's scope with
 * Weak leverage, or in an action in conflict." Scope is a judgment, answered with the grade. */
export function aaSpendsBonus(input: { usesLeft: number; inScope: boolean; grade: Grade; inConflict: boolean }): boolean {
  return input.usesLeft > 0 && input.inScope && (input.grade === "weak" || input.inConflict);
}

export type AdaptationTrigger = "kept-6-or-1" | "objective-achieved" | "objective-impossible";

/** Adaptation: rewrite one Action Table entry per trigger (ambiguity A5). An objective made
 * impossible also means a new objective and a new behavior rule roll. */
export function adaptationTriggers(input: {
  keptDice: readonly number[];
  objectiveAchieved?: boolean;
  objectiveImpossible?: boolean;
}): AdaptationTrigger[] {
  const out: AdaptationTrigger[] = [];
  if (input.keptDice.some((d) => d === 6 || d === 1)) out.push("kept-6-or-1");
  if (input.objectiveAchieved) out.push("objective-achieved");
  if (input.objectiveImpossible) out.push("objective-impossible");
  return out;
}

/** Elimination and New Powers: "Does a new power rise to fill the gap?" (Likely if what it held
 * still matters); a new power starts Wary. */
export function newPowerOdds(heldStillMatters: boolean): "likely" | "even" {
  return heldStillMatters ? "likely" : "even";
}
export const NEW_POWER_DISPOSITION: DispositionId = "wary";
