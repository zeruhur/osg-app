import { createRng } from "@osg/dice";
import { d6Script, facesRng } from "@osg/dice/testing";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { askOracle, isYes, oracleAnswer, readOracle, rollWhich } from "./oracle";

const pairs: number[][] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) pairs.push([a, b]);
const yesRate = (odds: "likely" | "even" | "unlikely") => {
  const outcomes = odds === "even" ? [1, 2, 3, 4, 5, 6].map((f) => [f]) : pairs;
  return outcomes.filter((f) => isYes(readOracle(odds, f).answer)).length / outcomes.length;
};

describe("the Oracle (solo_mode.qmd Part III)", () => {
  it("maps 6..1 to Yes-and, Yes, Yes-but, No-but, No, No-and", () => {
    expect([6, 5, 4, 3, 2, 1].map(oracleAnswer)).toEqual(["yes-and", "yes", "yes-but", "no-but", "no", "no-and"]);
  });

  it("gives Yes (4+) at 75% / 50% / 25% for Likely / Even / Unlikely, exactly", () => {
    expect(yesRate("likely")).toBe(0.75);
    expect(yesRate("even")).toBe(0.5);
    expect(yesRate("unlikely")).toBe(0.25);
  });

  it("is monotone in the odds: for the same dice, better odds never give a worse answer (property)", () => {
    const die = fc.integer({ min: 1, max: 6 });
    fc.assert(
      fc.property(die, die, (a, b) => {
        expect(readOracle("likely", [a, b]).kept).toBeGreaterThanOrEqual(readOracle("unlikely", [a, b]).kept);
      })
    );
  });

  it("rolls the right number of dice and reads them (Appendix B: Likely [2,4] -> Yes, but)", () => {
    expect(askOracle("likely", d6Script(2, 4))).toEqual({ faces: [2, 4], kept: 4, answer: "yes-but" });
    expect(askOracle("likely", d6Script(5, 3))).toEqual({ faces: [5, 3], kept: 5, answer: "yes" });
    expect(askOracle("unlikely", d6Script(6, 2))).toMatchObject({ kept: 2, answer: "no" });
    const even = d6Script(3);
    expect(askOracle("even", even)).toEqual({ faces: [3], kept: 3, answer: "no-but" });
    expect(even.remaining).toBe(0);
  });

  it("rejects the wrong number of dice", () => {
    expect(() => readOracle("even", [3, 4])).toThrow();
    expect(() => readOracle("likely", [3])).toThrow();
  });

  it("is deterministic for a seed", () => {
    expect(askOracle("even", createRng("q", 5))).toEqual(askOracle("even", createRng("q", 5)));
  });
});

describe("open questions: which faction / which thread", () => {
  it("numbers the candidates and rolls one die of that size", () => {
    expect(rollWhich(["caldrath", "meranto", "saivorn"], facesRng(3, [2]))).toEqual({ index: 1, face: 2, value: "meranto" });
    expect(() => rollWhich([], createRng("x"))).toThrow();
  });
});
