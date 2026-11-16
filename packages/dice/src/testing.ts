import type { Rng } from "./types";

const UINT32 = 0x100000000;

/** An Rng for tests: returns the given uniform values in [0, 1) in order. Past the end it returns
 * `fallback`, or throws if there is none, so a test notices an unexpected extra roll. */
export interface ScriptedRng extends Rng {
  /** Values not consumed yet. */
  readonly remaining: number;
}

export function scriptedRng(values: number[], options: { fallback?: number; seed?: string } = {}): ScriptedRng {
  for (const v of [...values, ...(options.fallback === undefined ? [] : [options.fallback])]) {
    if (!(v >= 0 && v < 1)) throw new RangeError(`Scripted value out of [0, 1): ${v}`);
  }
  const queue = [...values];
  let drawn = 0;
  const next = (): number => {
    const value = queue.shift() ?? options.fallback;
    if (value === undefined) throw new Error(`Scripted rng exhausted after ${drawn} draws`);
    drawn++;
    return value;
  };
  return {
    seed: options.seed ?? "scripted",
    get position() {
      return drawn;
    },
    get remaining() {
      return queue.length;
    },
    next,
    nextUint32: () => Math.floor(next() * UINT32)
  };
}

/** The uniform value that makes `rollDie(sides, rng)` land on `face`. */
export function valueForFace(sides: number, face: number): number {
  if (!Number.isInteger(face) || face < 1 || face > sides) throw new RangeError(`Face ${face} is not on a d${sides}`);
  return (face - 0.5) / sides;
}

/** An Rng whose rolls of a d`sides` come up as `faces`, in order. */
export function facesRng(sides: number, faces: number[], options: { fallback?: number; seed?: string } = {}): ScriptedRng {
  return scriptedRng(
    faces.map((face) => valueForFace(sides, face)),
    options
  );
}

/** An Rng whose d6 rolls come up as `faces`, in order, and that throws on any extra roll. */
export function d6Script(...faces: number[]): ScriptedRng {
  return facesRng(6, faces);
}
