import type { GameEvent, GameStatus } from "@osg/engine";

/** What the campaign list shows, without loading the log. */
export interface CampaignMeta {
  id: string;
  title: string;
  packId: string;
  packTitle: string;
  variant: string;
  player: string;
  playerName: string;
  turns: number;
  turn: number;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
}

/** One command's events: the command and every automatic task it triggered. The unit of undo. */
export interface StoredBatch {
  batch: number;
  /** The command type, or "setup" for batch 0. */
  command: string;
  at: string;
  events: GameEvent[];
}

export interface LoadedCampaign {
  meta: CampaignMeta;
  batches: StoredBatch[];
}

/** Where campaigns live. One campaign = one append-only log, written a batch at a time.
 * Implementations: memory (tests), IndexedDB (browser), SQLite (desktop). */
export interface CampaignStore {
  list(): Promise<CampaignMeta[]>;
  /** Creates a campaign with its setup events as batch 0. */
  create(meta: CampaignMeta, setup: GameEvent[]): Promise<void>;
  load(id: string): Promise<LoadedCampaign>;
  /** Appends a batch; its number must be the next one. Updates the listed meta. */
  append(id: string, batch: StoredBatch, meta: Partial<CampaignMeta>): Promise<void>;
  /** Removes the last batch and returns it. Batch 0 (setup) is never removed. */
  undo(id: string, meta: Partial<CampaignMeta>): Promise<StoredBatch | undefined>;
  remove(id: string): Promise<void>;
}

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

/** Checks a batch is the next one: the same rule for every implementation. */
export function checkNext(batches: readonly StoredBatch[], batch: StoredBatch): void {
  const expected = batches.length;
  if (batch.batch !== expected) throw new StoreError(`expected batch ${expected}, got ${batch.batch}`);
  const lastSeq = batches.at(-1)?.events.at(-1)?.seq ?? -1;
  if (batch.events[0] && batch.events[0].seq !== lastSeq + 1) {
    throw new StoreError(`batch ${batch.batch} starts at seq ${batch.events[0].seq}, expected ${lastSeq + 1}`);
  }
}

export const byUpdated = (a: CampaignMeta, b: CampaignMeta) => b.updatedAt.localeCompare(a.updatedAt);
