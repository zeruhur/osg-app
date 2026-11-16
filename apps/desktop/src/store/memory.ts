import type { GameEvent } from "@osg/engine";
import { StoreError, byUpdated, checkNext, type CampaignMeta, type CampaignStore, type LoadedCampaign, type StoredBatch } from "./types";

/** In-memory store for tests. Copies on the way in and out, like a real store would. */
export class MemoryStore implements CampaignStore {
  private campaigns = new Map<string, LoadedCampaign>();

  async list(): Promise<CampaignMeta[]> {
    return [...this.campaigns.values()].map((c) => structuredClone(c.meta)).sort(byUpdated);
  }

  async create(meta: CampaignMeta, setup: GameEvent[]): Promise<void> {
    if (this.campaigns.has(meta.id)) throw new StoreError(`campaign ${meta.id} already exists`);
    this.campaigns.set(meta.id, structuredClone({ meta, batches: [{ batch: 0, command: "setup", at: meta.createdAt, events: setup }] }));
  }

  async load(id: string): Promise<LoadedCampaign> {
    return structuredClone(this.get(id));
  }

  async append(id: string, batch: StoredBatch, meta: Partial<CampaignMeta>): Promise<void> {
    const c = this.get(id);
    checkNext(c.batches, batch);
    c.batches.push(structuredClone(batch));
    Object.assign(c.meta, meta);
  }

  async undo(id: string, meta: Partial<CampaignMeta>): Promise<StoredBatch | undefined> {
    const c = this.get(id);
    if (c.batches.length <= 1) return undefined;
    const last = c.batches.pop()!;
    Object.assign(c.meta, meta);
    return structuredClone(last);
  }

  async remove(id: string): Promise<void> {
    this.campaigns.delete(id);
  }

  private get(id: string): LoadedCampaign {
    const c = this.campaigns.get(id);
    if (!c) throw new StoreError(`no campaign ${id}`);
    return c;
  }
}
