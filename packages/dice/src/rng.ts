import type { Rng } from "./types";

const UINT32 = 0x100000000;

/** cyrb128: hashes a string into four 32-bit words, the seed state for sfc32. */
function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** A seeded generator (sfc32, seeded by a cyrb128 hash of `seed`), advanced to `position` draws.
 * The same seed and position always give the same sequence. */
export function createRng(seed: string, position = 0): Rng {
  if (!Number.isInteger(position) || position < 0) throw new RangeError(`Invalid rng position: ${position}`);
  let [a, b, c, d] = cyrb128(seed);
  let drawn = 0;

  const nextUint32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    drawn++;
    return t >>> 0;
  };

  for (let i = 0; i < position; i++) nextUint32();

  return {
    seed,
    get position() {
      return drawn;
    },
    nextUint32,
    next: () => nextUint32() / UINT32
  };
}

/** A uniform integer in 1..sides. */
export function rollDie(sides: number, rng: Rng): number {
  if (!Number.isInteger(sides) || sides < 1) throw new RangeError(`Invalid die: d${sides}`);
  return 1 + Math.floor(rng.next() * sides);
}
