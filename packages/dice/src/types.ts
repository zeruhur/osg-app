/** A source of uniform random numbers. Every roll in the app goes through one, so any roll can be
 * reproduced from its `seed` and the `position` it was made at. */
export interface Rng {
  readonly seed: string;
  /** Number of draws consumed so far. `createRng(seed, position)` resumes from here. */
  readonly position: number;
  /** A uniform integer in [0, 2^32). Consumes one draw. */
  nextUint32(): number;
  /** A uniform float in [0, 1). Consumes one draw. */
  next(): number;
}

/** A 2d6 roll where one die is kept (Strong/Weak leverage, Likely/Unlikely Oracle odds). */
export interface KeptRoll {
  dice: [number, number];
  kept: number;
  doubles: boolean;
}

export interface D66Roll {
  tens: number;
  units: number;
  /** `tens * 10 + units`, 11..66. */
  value: number;
}
