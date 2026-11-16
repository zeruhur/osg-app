import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { band, forceOfNatureAvailable, keepFor, keepForAction, readRoll, resolveConflict, succeeds } from "./resolution";

const die = fc.integer({ min: 1, max: 6 });
const grade = fc.constantFrom("strong" as const, "weak" as const);
const pairs: [number, number][] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) pairs.push([a, b]);

describe("dice mechanic (contested_ground.qmd Part IV)", () => {
  it("keeps high on Strong, low on Weak", () => {
    expect(keepFor("strong")).toBe("high");
    expect(keepFor("weak")).toBe("low");
  });

  it("bands 6 / 4-5 / 2-3 / 1", () => {
    expect([1, 2, 3, 4, 5, 6].map(band)).toEqual(["especially-bad", "worse", "worse", "success", "success", "especially-good"]);
    expect([1, 2, 3, 4, 5, 6].map((r) => succeeds(band(r)))).toEqual([false, false, false, true, true, true]);
  });

  it("gives the stated odds exactly: Strong 75% and Weak 25% for 4+", () => {
    const rate = (g: "strong" | "weak") => pairs.filter((p) => succeeds(readRoll(g, false, p).band)).length / 36;
    expect(rate("strong")).toBe(0.75);
    expect(rate("weak")).toBe(0.25);
  });

  it("flags doubles", () => {
    expect(readRoll("strong", false, [4, 4]).doubles).toBe(true);
    expect(readRoll("strong", false, [4, 5]).doubles).toBe(false);
  });
});

describe("bonus (contested_ground.qmd Part VII, Spending a bonus)", () => {
  it("makes a Weak action Strong", () => {
    expect(keepForAction("weak", true)).toBe("high");
    expect(readRoll("weak", true, [2, 5])).toMatchObject({ keep: "high", kept: 5, effective: 5, band: "success", bonusEffect: "weak-to-strong" });
  });

  it("turns a Strong kept 4 or 5 into a 6 (Appendix B: Pass Wardens on [3,5])", () => {
    expect(readRoll("strong", true, [3, 5])).toMatchObject({ kept: 5, effective: 6, band: "especially-good", bonusEffect: "4-5-to-6" });
    expect(readRoll("strong", true, [4, 1])).toMatchObject({ kept: 4, effective: 6, bonusEffect: "4-5-to-6" });
  });

  it("leaves a Strong kept 1-3 unchanged but still spends the bonus", () => {
    for (const p of [[1, 1], [2, 1], [3, 2]] as [number, number][]) {
      const r = readRoll("strong", true, p);
      expect(r.effective).toBe(r.kept);
      expect(r.bonusEffect).toBe("no-effect");
    }
  });

  it("leaves a Strong kept 6 at 6, spent (A6)", () => {
    expect(readRoll("strong", true, [6, 2])).toMatchObject({ effective: 6, bonusEffect: "no-effect" });
  });

  it("has no bonus effect when none is declared", () => {
    expect(readRoll("strong", false, [3, 5]).bonusEffect).toBeUndefined();
  });

  it("never lowers a result (property)", () => {
    fc.assert(
      fc.property(grade, die, die, (g, a, b) => {
        expect(readRoll(g, true, [a, b]).effective).toBeGreaterThanOrEqual(readRoll(g, false, [a, b]).effective);
      })
    );
  });

  it("keeps a die that was rolled, and the effective result is the kept die or 6 (property)", () => {
    fc.assert(
      fc.property(grade, fc.boolean(), die, die, (g, bonus, a, b) => {
        const r = readRoll(g, bonus, [a, b]);
        expect([a, b]).toContain(r.kept);
        expect([r.kept, 6]).toContain(r.effective);
      })
    );
  });
});

describe("actions in conflict (contested_ground.qmd Part IV)", () => {
  it("lets the higher result prevail; the other is worse than desired whatever it rolled", () => {
    expect(resolveConflict([{ id: "a", effective: 5 }, { id: "b", effective: 4 }])).toEqual([
      { id: "a", outcome: "prevails", band: "success" },
      { id: "b", outcome: "worse", band: "worse" }
    ]);
  });

  it("Appendix B: Essaveth 6 (Pass Wardens) vs Caldrath 4 -> Essaveth prevails", () => {
    const essaveth = readRoll("strong", true, [3, 5]);
    const caldrath = readRoll("strong", false, [4, 4]);
    expect(resolveConflict([{ id: "essaveth", effective: essaveth.effective }, { id: "caldrath", effective: caldrath.effective }])).toEqual([
      { id: "essaveth", outcome: "prevails", band: "especially-good" },
      { id: "caldrath", outcome: "worse", band: "worse" }
    ]);
  });

  it("keeps 'something especially bad' for a losing 1", () => {
    expect(resolveConflict([{ id: "a", effective: 3 }, { id: "b", effective: 1 }])[1]).toEqual({ id: "b", outcome: "worse", band: "especially-bad" });
  });

  it("makes a tie a standoff: both worse than desired", () => {
    expect(resolveConflict([{ id: "a", effective: 4 }, { id: "b", effective: 4 }]).map((r) => [r.outcome, r.band])).toEqual([
      ["standoff", "worse"],
      ["standoff", "worse"]
    ]);
  });

  it("with three or more, a tie at the top is a standoff among the tied; everyone below is worse", () => {
    expect(
      resolveConflict([
        { id: "a", effective: 5 },
        { id: "b", effective: 5 },
        { id: "c", effective: 6 },
        { id: "d", effective: 1 }
      ]).map((r) => [r.id, r.outcome, r.band])
    ).toEqual([
      ["a", "worse", "worse"],
      ["b", "worse", "worse"],
      ["c", "prevails", "especially-good"],
      ["d", "worse", "especially-bad"]
    ]);
    expect(
      resolveConflict([
        { id: "a", effective: 6 },
        { id: "b", effective: 6 },
        { id: "c", effective: 2 }
      ]).map((r) => r.outcome)
    ).toEqual(["standoff", "standoff", "worse"]);
  });

  it("reads both as rolled when both outcomes can be true (two actions only, A7)", () => {
    expect(resolveConflict([{ id: "a", effective: 2 }, { id: "b", effective: 6 }], true).map((r) => [r.outcome, r.band])).toEqual([
      ["as-rolled", "worse"],
      ["as-rolled", "especially-good"]
    ]);
    expect(() => resolveConflict([{ id: "a", effective: 2 }, { id: "b", effective: 6 }, { id: "c", effective: 1 }], true)).toThrow();
    expect(() => resolveConflict([{ id: "a", effective: 2 }])).toThrow();
  });

  it("has exactly one winner or a standoff of two or more; only the winner can do better than 'worse' (property)", () => {
    fc.assert(
      fc.property(fc.array(die, { minLength: 2, maxLength: 5 }), (results) => {
        const out = resolveConflict(results.map((effective, i) => ({ id: String(i), effective })));
        const winners = out.filter((r) => r.outcome === "prevails");
        const standoff = out.filter((r) => r.outcome === "standoff");
        expect(winners.length === 1 ? standoff.length === 0 : winners.length === 0 && standoff.length >= 2).toBe(true);
        const top = Math.max(...results);
        for (const w of winners) expect(results[Number(w.id)]).toBe(top);
        for (const r of out) if (r.outcome !== "prevails") expect(["worse", "especially-bad"]).toContain(r.band);
      })
    );
  });

  it("matches the stated odds: Strong beats Weak 77% with 11% ties; equal grades tie about 1 in 5", () => {
    let strongWins = 0;
    let ties = 0;
    let equalTies = 0;
    for (const s of pairs)
      for (const w of pairs) {
        const [a, b] = resolveConflict([
          { id: "s", effective: readRoll("strong", false, s).effective },
          { id: "w", effective: readRoll("weak", false, w).effective }
        ]);
        if (a!.outcome === "prevails") strongWins++;
        if (a!.outcome === "standoff") ties++;
        void b;
        const [x] = resolveConflict([
          { id: "x", effective: readRoll("strong", false, s).effective },
          { id: "y", effective: readRoll("strong", false, w).effective }
        ]);
        if (x!.outcome === "standoff") equalTies++;
      }
    expect(Math.round((strongWins / 1296) * 100)).toBe(77);
    expect(Math.round((ties / 1296) * 100)).toBe(11);
    expect(equalTies / 1296).toBeCloseTo(0.2, 1);
  });
});

describe("Force of Nature (contested_ground.qmd Part IV)", () => {
  it("is available on doubles, once or twice per game", () => {
    expect(forceOfNatureAvailable(true, 0)).toBe(true);
    expect(forceOfNatureAvailable(true, 1)).toBe(true);
    expect(forceOfNatureAvailable(true, 2)).toBe(false);
    expect(forceOfNatureAvailable(false, 0)).toBe(false);
  });
});
