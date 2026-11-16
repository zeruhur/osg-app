import { fold } from "@osg/engine";
import { describe, expect, it } from "vitest";
import { classify } from "./policy";
import { playGame, type GameOptions } from "./play";
import { addGame, emptyStats, formatStats, type SimStats } from "./stats";

const OPTIONS: GameOptions = { pack: "corentine", player: "essaveth" };

function run(seed: string, games: number, options = OPTIONS): SimStats {
  const stats = emptyStats();
  for (let i = 0; i < games; i++) addGame(stats, playGame(`${seed}-${i}`, options));
  return stats;
}

describe("sim", () => {
  it("is deterministic for a seed, and different for another", () => {
    const a = formatStats(run("det", 8), "h");
    expect(formatStats(run("det", 8), "h")).toBe(a);
    expect(formatStats(run("other", 8), "h")).not.toBe(a);
  });

  it("plays every game to the end, and every log replays to the same state", () => {
    for (let i = 0; i < 25; i++) {
      const g = playGame(`replay-${i}`, OPTIONS);
      expect(g.state.status).toBe("ended");
      expect(g.state.turn).toBe(6);
      expect(fold(JSON.parse(JSON.stringify(g.log)))).toEqual(g.state);
    }
  });

  it("plays the full five-faction game, other factions, and other turn counts", () => {
    for (const options of [
      { pack: "corentine", variant: "full", player: "caldrath" },
      { pack: "corentine", player: "meranto", turns: 4 },
      { pack: "corentine", variant: "full", player: "conclave", turns: 8, policy: { forceOfNature: true, offer: 1 } }
    ] satisfies GameOptions[]) {
      for (let i = 0; i < 5; i++) expect(playGame(`variants-${i}`, options).state.status).toBe("ended");
    }
  });

  it("lands near the stated odds (contested_ground.qmd Part IV), over 200 games", () => {
    const s = run("odds", 200);
    const desired = (b: SimStats["rolls"]["strong"]) => (b["especially-good"] + b.success) / (b["especially-good"] + b.success + b.worse + b["especially-bad"]);
    expect(Math.abs(desired(s.rolls.strong) - 0.75)).toBeLessThan(0.05);
    expect(Math.abs(desired(s.rolls.weak) - 0.25)).toBeLessThan(0.05);
    const sw = s.conflicts.strongVsWeak;
    expect(sw.n).toBeGreaterThan(150);
    expect(Math.abs(sw.strongPrevails / sw.n - 0.77)).toBeLessThan(0.08);
    expect(Math.abs(sw.standoff / sw.n - 0.11)).toBeLessThan(0.06);
    // Corentine fixes the Breaking Point at the end of Turn 4; pushbacks can only delay it.
    expect(s.clock.breakingTurnTotal / s.clock.breakingPoint).toBeGreaterThanOrEqual(4);
  });
});

describe("the classify policy", () => {
  it("pairs actions aimed at each other's actors, and leaves holds unopposed", () => {
    const g = playGame("classify-0", OPTIONS);
    const s = g.state;
    const groups = classify(s, s.current.order);
    expect(groups.flatMap((x) => x.actions).sort()).toEqual([...s.current.order].sort());
    for (const grp of groups) {
      if (grp.class === "conflict") expect(grp.actions).toHaveLength(2);
      for (const id of grp.actions) if (s.current.actions[id]!.source === "hold") expect(grp.class).toBe("unopposed");
    }
  });
});
