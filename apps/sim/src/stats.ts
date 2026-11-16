import type { EventOf, GameEvent } from "@osg/engine";
import type { PlayedGame } from "./play";

type Bands = Record<"especially-good" | "success" | "worse" | "especially-bad", number>;
const emptyBands = (): Bands => ({ "especially-good": 0, success: 0, worse: 0, "especially-bad": 0 });
const bandOf = (r: number): keyof Bands => (r === 6 ? "especially-good" : r >= 4 ? "success" : r >= 2 ? "worse" : "especially-bad");

export interface SimStats {
  games: number;
  turns: number;
  events: number;
  /** Bands of single rolls by grade (bonus effects excluded). */
  rolls: { strong: Bands; weak: Bands; withBonus: Bands };
  /** Two-action conflicts with no bonus, by grade pairing. */
  conflicts: {
    strongVsWeak: { n: number; strongPrevails: number; standoff: number };
    equalGrades: { n: number; standoff: number };
  };
  offers: { made: number; byOdds: Record<string, number>; deals: number };
  deals: { struck: number; keptChecks: number; brokenByAA: number; ended: number };
  holds: number;
  signals: Record<string, number>;
  secrets: Record<string, number>;
  covert: { checks: number; noticed: number };
  forceOfNature: number;
  clock: { finalPosition: Record<number, number>; breakingPoint: number; breakingTurnTotal: number };
  finalDisposition: Record<string, number>;
  finalStandingFirst: Record<string, number>;
}

export function emptyStats(): SimStats {
  return {
    games: 0,
    turns: 0,
    events: 0,
    rolls: { strong: emptyBands(), weak: emptyBands(), withBonus: emptyBands() },
    conflicts: { strongVsWeak: { n: 0, strongPrevails: 0, standoff: 0 }, equalGrades: { n: 0, standoff: 0 } },
    offers: { made: 0, byOdds: {}, deals: 0 },
    deals: { struck: 0, keptChecks: 0, brokenByAA: 0, ended: 0 },
    holds: 0,
    signals: {},
    secrets: {},
    covert: { checks: 0, noticed: 0 },
    forceOfNature: 0,
    clock: { finalPosition: {}, breakingPoint: 0, breakingTurnTotal: 0 },
    finalDisposition: {},
    finalStandingFirst: {}
  };
}

const inc = (r: Record<string | number, number>, k: string | number, by = 1) => (r[k] = (r[k] ?? 0) + by);
const of = <T extends GameEvent["type"]>(log: GameEvent[], t: T) => log.filter((e): e is EventOf<T> => e.type === t);

/** Adds one game to the totals. */
export function addGame(stats: SimStats, g: PlayedGame): void {
  const { log, state } = g;
  stats.games++;
  stats.turns += state.turn;
  stats.events += log.length;

  for (const e of of(log, "DiceRolled")) {
    const bucket = e.bonusEffect ? stats.rolls.withBonus : stats.rolls[e.grade];
    bucket[bandOf(e.effective)]++;
  }

  // Conflicts: the groups are per turn, and action ids repeat across turns, so walk turn by turn.
  for (const classified of of(log, "ActionsClassified")) {
    const turnRolls = new Map(of(log, "DiceRolled").filter((e) => e.turn === classified.turn).map((e) => [e.action, e]));
    const judged = new Map(of(log, "ConflictJudged").filter((e) => e.turn === classified.turn).map((e) => [e.group, e.bothCanBeTrue]));
    for (const grp of classified.groups) {
      if (grp.class !== "conflict" || grp.actions.length !== 2 || judged.get(grp.id)) continue;
      const [a, b] = grp.actions.map((id) => turnRolls.get(id));
      if (!a || !b || a.bonusEffect || b.bonusEffect) continue;
      if (a.grade !== b.grade) {
        const [s, w] = a.grade === "strong" ? [a, b] : [b, a];
        stats.conflicts.strongVsWeak.n++;
        if (s.effective > w.effective) stats.conflicts.strongVsWeak.strongPrevails++;
        if (s.effective === w.effective) stats.conflicts.strongVsWeak.standoff++;
      } else {
        stats.conflicts.equalGrades.n++;
        if (a.effective === b.effective) stats.conflicts.equalGrades.standoff++;
      }
    }
  }

  for (const e of of(log, "OfferMade")) {
    stats.offers.made++;
    inc(stats.offers.byOdds, e.odds);
  }
  stats.offers.deals += of(log, "OfferSettled").filter((e) => e.deal).length;
  stats.deals.struck += of(log, "DealStruck").length;
  stats.deals.keptChecks += of(log, "OracleConsulted").filter((e) => e.purpose.kind === "deal-keep").length;
  stats.deals.brokenByAA += of(log, "DealBroken").filter((e) => e.by !== state.player).length;
  stats.deals.ended += of(log, "DealEnded").length;
  stats.holds += of(log, "AAHeld").length;
  for (const e of of(log, "SignalRolled")) inc(stats.signals, e.signal);
  for (const e of of(log, "SecretRolled")) inc(stats.secrets, `${e.cause}/${e.status}`);
  const notices = of(log, "OracleConsulted").filter((e) => e.purpose.kind === "notice");
  stats.covert.checks += notices.length;
  stats.covert.noticed += of(log, "CovertNoticed").length;
  stats.forceOfNature += state.forceOfNatureUsed;

  inc(stats.clock.finalPosition, state.clock.position);
  const breaking = state.clock.escalations.find((e) => e.breakingPoint);
  const landed = of(log, "EscalationLanded").find((e) => e.box === breaking?.box);
  if (landed) {
    stats.clock.breakingPoint++;
    stats.clock.breakingTurnTotal += landed.turn;
  }
  for (const aa of Object.values(state.aa)) inc(stats.finalDisposition, aa.disposition);
  inc(stats.finalStandingFirst, state.standing[0]!);
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const dist = (r: Record<string | number, number>, total: number) =>
  Object.entries(r)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([k, v]) => `${k} ${pct(v, total)}`)
    .join(", ");

/** A plain-text report. Deterministic for the same stats. */
export function formatStats(s: SimStats, header: string): string {
  const bands = (b: Bands) => {
    const n = b["especially-good"] + b.success + b.worse + b["especially-bad"];
    return `n=${n}  6: ${pct(b["especially-good"], n)}  4-5: ${pct(b.success, n)}  2-3: ${pct(b.worse, n)}  1: ${pct(b["especially-bad"], n)}  desired (4+): ${pct(b["especially-good"] + b.success, n)}`;
  };
  const sw = s.conflicts.strongVsWeak;
  const eq = s.conflicts.equalGrades;
  const aaGames = Object.values(s.finalDisposition).reduce((a, b) => a + b, 0);
  return [
    header,
    `games ${s.games}, turns ${s.turns}, events ${s.events} (${(s.events / Math.max(1, s.games)).toFixed(0)} per game)`,
    "",
    "Rolls (contested_ground.qmd Part IV: Strong 75%, Weak 25% desired)",
    `  strong      ${bands(s.rolls.strong)}`,
    `  weak        ${bands(s.rolls.weak)}`,
    `  with bonus  ${bands(s.rolls.withBonus)}`,
    "Conflicts, two actions, no bonus (stated: Strong beats Weak 77%, 11% ties; equal grades tie about 1 in 5)",
    `  strong vs weak  n=${sw.n}  strong prevails ${pct(sw.strongPrevails, sw.n)}  standoff ${pct(sw.standoff, sw.n)}`,
    `  equal grades    n=${eq.n}  standoff ${pct(eq.standoff, eq.n)}`,
    "Talk",
    `  offers ${s.offers.made} (${dist(s.offers.byOdds, s.offers.made)}), deals from offers ${pct(s.offers.deals, s.offers.made)}`,
    `  deals struck ${s.deals.struck}, keep checks ${s.deals.keptChecks}, broken by an AA ${s.deals.brokenByAA}, ended ${s.deals.ended}`,
    "AAs",
    `  holds ${s.holds} (${(s.holds / Math.max(1, s.games)).toFixed(2)} per game)`,
    `  signals: ${dist(s.signals, Object.values(s.signals).reduce((a, b) => a + b, 0))}`,
    `  secrets uncovered: ${Object.entries(s.secrets).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`,
    `  covert actions noticed ${pct(s.covert.noticed, s.covert.checks)} of ${s.covert.checks}`,
    `  final disposition: ${dist(s.finalDisposition, aaGames)}`,
    "Clock",
    `  final position: ${dist(s.clock.finalPosition, s.games)}`,
    `  Breaking Point reached in ${pct(s.clock.breakingPoint, s.games)} of games` +
      (s.clock.breakingPoint ? `, on average in turn ${(s.clock.breakingTurnTotal / s.clock.breakingPoint).toFixed(2)}` : ""),
    `Forces of Nature used ${s.forceOfNature}`,
    `Dominant at the end: ${dist(s.finalStandingFirst, s.games)}`
  ].join("\n");
}
