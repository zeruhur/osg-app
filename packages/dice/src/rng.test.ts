import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng, rollDie } from "./rng";
import { d6Script, facesRng, scriptedRng, valueForFace } from "./testing";

const draws = (rng: ReturnType<typeof createRng>, n: number) => Array.from({ length: n }, () => rng.nextUint32());

describe("createRng", () => {
  it("gives the same sequence for the same seed", () => {
    expect(draws(createRng("corentine"), 20)).toEqual(draws(createRng("corentine"), 20));
  });

  it("gives different sequences for different seeds", () => {
    expect(draws(createRng("a"), 8)).not.toEqual(draws(createRng("b"), 8));
  });

  it("pins the generator: changing the algorithm breaks every saved campaign", () => {
    // If this fails, the Rng changed. Replays of stored games would diverge; do not update it lightly.
    expect(draws(createRng("osg"), 4)).toMatchInlineSnapshot(`
      [
        2116341269,
        384492817,
        2158928728,
        845062240,
      ]
    `);
  });

  it("counts draws in position, whichever method consumed them", () => {
    const rng = createRng("x");
    rng.next();
    rng.nextUint32();
    rollDie(6, rng);
    expect(rng.position).toBe(3);
  });

  it("resumes from (seed, position) exactly", () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(200), fc.nat(50), (seed, position, length) => {
        const walked = createRng(seed);
        draws(walked, position);
        const resumed = createRng(seed, position);
        expect(resumed.position).toBe(position);
        expect(draws(resumed, length)).toEqual(draws(walked, length));
      })
    );
  });

  it("rejects a negative or fractional position", () => {
    expect(() => createRng("x", -1)).toThrow(RangeError);
    expect(() => createRng("x", 1.5)).toThrow(RangeError);
  });

  it("keeps next() in [0, 1)", () => {
    const rng = createRng("unit");
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});

describe("rollDie", () => {
  it("lands on every face in 1..sides and nothing else", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 100 }), (seed, sides) => {
        const rng = createRng(seed);
        for (let i = 0; i < 50; i++) {
          const face = rollDie(sides, rng);
          expect(Number.isInteger(face) && face >= 1 && face <= sides).toBe(true);
        }
      })
    );
  });

  it("is roughly uniform on a d6", () => {
    const rng = createRng("uniform");
    const counts = [0, 0, 0, 0, 0, 0];
    const n = 60_000;
    for (let i = 0; i < n; i++) counts[rollDie(6, rng) - 1]!++;
    for (const c of counts) expect(Math.abs(c - n / 6)).toBeLessThan(n / 6 * 0.05);
  });

  it("rejects a die with no faces", () => {
    expect(() => rollDie(0, createRng("x"))).toThrow(RangeError);
  });
});

describe("scripted rngs", () => {
  it("lands on the scripted faces", () => {
    const rng = facesRng(20, [1, 20, 7]);
    expect([rollDie(20, rng), rollDie(20, rng), rollDie(20, rng)]).toEqual([1, 20, 7]);
  });

  it("throws on an unexpected extra roll unless there is a fallback", () => {
    const rng = d6Script(3);
    expect(rollDie(6, rng)).toBe(3);
    expect(rng.remaining).toBe(0);
    expect(() => rollDie(6, rng)).toThrow(/exhausted/);
    expect(rollDie(6, scriptedRng([], { fallback: valueForFace(6, 5) }))).toBe(5);
  });

  it("rejects values outside [0, 1) and faces not on the die", () => {
    expect(() => scriptedRng([1])).toThrow(RangeError);
    expect(() => valueForFace(6, 7)).toThrow(RangeError);
  });
});
