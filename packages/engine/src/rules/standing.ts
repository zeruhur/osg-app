import type { FactionId } from "../types";

// solo_mode.qmd Part IV, Standing: every faction, Dominant first, Exposed last.

/** Moves a faction one place toward Exposed (Especially Good 4, "Weakens a rival"). No-op at the bottom. */
export function moveDown(standing: readonly FactionId[], id: FactionId): FactionId[] {
  const out = [...standing];
  const i = out.indexOf(id);
  if (i < 0) throw new RangeError(`${id} is not in Standing`);
  if (i < out.length - 1) [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
  return out;
}

/** Moves a faction one place toward Dominant (Especially Bad 4, "Strengthens a rival"). No-op at the top. */
export function moveUp(standing: readonly FactionId[], id: FactionId): FactionId[] {
  const out = [...standing];
  const i = out.indexOf(id);
  if (i < 0) throw new RangeError(`${id} is not in Standing`);
  if (i > 0) [out[i - 1], out[i]] = [out[i]!, out[i - 1]!];
  return out;
}

/** True if `order` is a reordering of exactly the factions in `standing`. */
export function isReordering(standing: readonly FactionId[], order: readonly FactionId[]): boolean {
  return standing.length === order.length && new Set(order).size === order.length && standing.every((f) => order.includes(f));
}
