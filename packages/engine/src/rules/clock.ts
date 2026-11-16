// solo_mode.qmd Part VII, The Crisis Clock.

/** "Set its length to the number of turns minus one, unless the scenario fixes it." */
export function defaultClockLength(turns: number): number {
  return turns - 1;
}

/** "Advance one box at the end of every turn." */
export const END_OF_TURN = 1;
/** "Advance one more when an outcome's 'something especially bad' or a Force of Nature makes the
 * Problem worse." */
export const PROBLEM_WORSENED = 1;
/** "Push it back one box when an action whose Outcome addresses the Problem itself, not a rival,
 * rolls a 6." */
export const PROBLEM_ADDRESSED = -1;

export interface ClockLike {
  length: number;
  position: number;
  escalations: readonly { box: number; landed: boolean }[];
}

/** Moves the clock by `delta`, clamped to 0..length. Returns the new position and the boxes of the
 * escalations reached for the first time ("When the clock reaches an Escalation, it happens in
 * that turn's Report"). Pushing back never un-lands an escalation. */
export function moveClock(clock: ClockLike, delta: number): { position: number; landing: number[] } {
  const position = Math.min(clock.length, Math.max(0, clock.position + delta));
  const landing = clock.escalations.filter((e) => !e.landed && e.box <= position).map((e) => e.box);
  return { position, landing };
}
