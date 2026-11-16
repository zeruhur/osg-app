import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { roll2d6Keep, rollD66 } from "./osg";
import { createRng } from "./rng";
import { d6Script } from "./testing";

describe("roll2d6Keep", () => {
  it("keeps the higher die for high and the lower for low, in rolled order", () => {
    expect(roll2d6Keep("high", d6Script(3, 5))).toEqual({ dice: [3, 5], kept: 5, doubles: false });
    expect(roll2d6Keep("low", d6Script(2, 4))).toEqual({ dice: [2, 4], kept: 2, doubles: false });
  });

  it("flags doubles (Appendix B: Caldrath 2d6kh1[4,4]=4)", () => {
    expect(roll2d6Keep("high", d6Script(4, 4))).toEqual({ dice: [4, 4], kept: 4, doubles: true });
  });

  it("matches the stated odds: Strong 75% and Weak 25% for 4+ (contested_ground.qmd Part IV)", () => {
    const rng = createRng("odds");
    const n = 100_000;
    let strong = 0;
    let weak = 0;
    for (let i = 0; i < n; i++) {
      if (roll2d6Keep("high", rng).kept >= 4) strong++;
      if (roll2d6Keep("low", rng).kept >= 4) weak++;
    }
    expect(strong / n).toBeCloseTo(0.75, 2);
    expect(weak / n).toBeCloseTo(0.25, 2);
  });

  it("never keeps a die it did not roll", () => {
    fc.assert(
      fc.property(fc.string(), fc.constantFrom("high" as const, "low" as const), (seed, keep) => {
        const { dice, kept, doubles } = roll2d6Keep(keep, createRng(seed));
        expect(dice).toContain(kept);
        expect(kept).toBe(keep === "high" ? Math.max(...dice) : Math.min(...dice));
        expect(doubles).toBe(dice[0] === dice[1]);
      })
    );
  });
});

describe("rollD66", () => {
  it("reads the first die as tens (solo_mode.qmd Appendix C: a 3 then a 5 is 35)", () => {
    expect(rollD66(d6Script(3, 5))).toEqual({ tens: 3, units: 5, value: 35 });
  });

  it("stays in 11..66 with both digits 1..6", () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        const { tens, units, value } = rollD66(createRng(seed));
        expect(value).toBe(tens * 10 + units);
        expect([tens, units].every((d) => d >= 1 && d <= 6)).toBe(true);
      })
    );
  });
});
