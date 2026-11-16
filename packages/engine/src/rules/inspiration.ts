import { rollD6, type Rng } from "@osg/dice";
import { faceRow, inspiration, type InspirationEffect } from "@osg/rules-data";
import type { Band, FactionId } from "../types";

// solo_mode.qmd Part VIII, Inspiration Tables.

export type InspirationTable = keyof typeof inspiration;

export interface InspirationEntry {
  table: InspirationTable;
  face: number;
  text: string;
  effect?: InspirationEffect | undefined;
}

export function inspirationEntry(table: InspirationTable, face: number): InspirationEntry {
  const row = faceRow(inspiration[table].rows, face);
  return { table, face, text: row.text, effect: row.effect };
}

export function rollInspiration(table: InspirationTable, rng: Rng): InspirationEntry {
  return inspirationEntry(table, rollD6(rng));
}

/** The table a band calls for, if any: a 6 may add something especially good, a 1 something
 * especially bad (contested_ground.qmd Part IV). Using it is optional (`inspiration` decision). */
export function inspirationTableFor(band: Band): InspirationTable | undefined {
  return band === "especially-good" ? "especiallyGood" : band === "especially-bad" ? "especiallyBad" : undefined;
}

/** Entries 5 (good) and 2 (bad) move an AA's disposition by ±1.
 * - The player acts: "one AA involved" moves toward the player (which one is the player's call).
 * - An AA acts: "read entries 2 and 5 as disposition toward the faction it acted on, if that
 *   faction is you": the acting AA's disposition toward the player moves; otherwise nothing. */
export function inspirationDisposition(input: {
  effect: InspirationEffect | undefined;
  actor: FactionId;
  player: FactionId;
  /** For an AA actor: the faction it acted on. */
  actedOn?: FactionId | undefined;
  /** For the player actor: the involved AA the player picks. */
  involvedAA?: FactionId | undefined;
}): { aa: FactionId; delta: 1 | -1 } | undefined {
  const delta = input.effect === "disposition-up" ? 1 : input.effect === "disposition-down" ? -1 : undefined;
  if (delta === undefined) return undefined;
  if (input.actor === input.player) return input.involvedAA ? { aa: input.involvedAA, delta } : undefined;
  return input.actedOn === input.player ? { aa: input.actor, delta } : undefined;
}
