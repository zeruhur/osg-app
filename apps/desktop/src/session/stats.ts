import type { FactionId, GameEvent } from "@osg/engine";

export interface FactionStats {
  actions: number;
  graded: number;
  strong: number;
  /** Outcomes that got the desired result (6 or 4-5, or unopposed). */
  desired: number;
  rolled: number;
  bonusesSpent: number;
}

export interface GameStats {
  byFaction: Record<FactionId, FactionStats>;
  offers: number;
  deals: number;
  dealsBrokenByAA: number;
  dealsBrokenByYou: number;
  secretsUncovered: number;
  forcesOfNature: number;
}

/** Numbers for the Debrief, read from the log. Action ids repeat across turns, so actions are keyed
 * by turn and id. The per-faction Strong rate is the style-leak check the design doc asks for: the
 * same checklist should grade every faction alike. */
export function gameStats(log: readonly GameEvent[], player: FactionId): GameStats {
  const owner = new Map<string, FactionId>();
  const key = (turn: number, id: string) => `${turn}:${id}`;
  const byFaction: Record<FactionId, FactionStats> = {};
  const f = (id: FactionId) => (byFaction[id] ??= { actions: 0, graded: 0, strong: 0, desired: 0, rolled: 0, bonusesSpent: 0 });
  const stats: GameStats = { byFaction, offers: 0, deals: 0, dealsBrokenByAA: 0, dealsBrokenByYou: 0, secretsUncovered: 0, forcesOfNature: 0 };

  for (const e of log) {
    switch (e.type) {
      case "ActionDeclared":
      case "ActionAccepted":
      case "AAHeld":
        owner.set(key(e.turn, e.action.id), e.action.faction);
        f(e.action.faction).actions++;
        break;
      case "LeverageGraded": {
        const who = owner.get(key(e.turn, e.action));
        if (who) {
          f(who).graded++;
          if (e.grade === "strong") f(who).strong++;
        }
        break;
      }
      case "DiceRolled": {
        const who = owner.get(key(e.turn, e.action));
        if (who) f(who).rolled++;
        break;
      }
      case "ResultBanded": {
        const who = owner.get(key(e.turn, e.action));
        if (who && (e.band === "especially-good" || e.band === "success")) f(who).desired++;
        break;
      }
      case "BonusSpent":
        f(e.faction).bonusesSpent++;
        break;
      case "OfferMade":
        stats.offers++;
        break;
      case "DealStruck":
        stats.deals++;
        break;
      case "DealBroken":
        if (e.by === player) stats.dealsBrokenByYou++;
        else stats.dealsBrokenByAA++;
        break;
      case "SecretRolled":
        stats.secretsUncovered++;
        break;
      case "ForceOfNatureAnswered":
        if (e.use) stats.forcesOfNature++;
        break;
    }
  }
  return stats;
}
