import type { GameEvent } from "@osg/engine";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { StoreError, byUpdated, checkNext, type CampaignMeta, type CampaignStore, type LoadedCampaign, type StoredBatch } from "./types";

interface Schema extends DBSchema {
  campaigns: { key: string; value: CampaignMeta };
  batches: { key: [string, number]; value: StoredBatch & { campaign: string }; indexes: { campaign: string } };
}

/** Browser store: one IndexedDB database, campaign metas and batches in two object stores.
 * Each write is one IndexedDB transaction, so a batch lands whole or not at all. */
export class IndexedDbStore implements CampaignStore {
  private db: Promise<IDBPDatabase<Schema>>;

  constructor(name = "osg-solo") {
    this.db = openDB<Schema>(name, 1, {
      upgrade(db) {
        db.createObjectStore("campaigns", { keyPath: "id" });
        const batches = db.createObjectStore("batches", { keyPath: ["campaign", "batch"] });
        batches.createIndex("campaign", "campaign");
      }
    });
  }

  async list(): Promise<CampaignMeta[]> {
    return (await (await this.db).getAll("campaigns")).sort(byUpdated);
  }

  async create(meta: CampaignMeta, setup: GameEvent[]): Promise<void> {
    const tx = (await this.db).transaction(["campaigns", "batches"], "readwrite");
    if (await tx.objectStore("campaigns").get(meta.id)) throw new StoreError(`campaign ${meta.id} already exists`);
    await tx.objectStore("campaigns").put(meta);
    await tx.objectStore("batches").put({ campaign: meta.id, batch: 0, command: "setup", at: meta.createdAt, events: setup });
    await tx.done;
  }

  async load(id: string): Promise<LoadedCampaign> {
    const db = await this.db;
    const meta = await db.get("campaigns", id);
    if (!meta) throw new StoreError(`no campaign ${id}`);
    const batches = (await db.getAllFromIndex("batches", "campaign", id)).sort((a, b) => a.batch - b.batch).map(strip);
    return { meta, batches };
  }

  async append(id: string, batch: StoredBatch, meta: Partial<CampaignMeta>): Promise<void> {
    const tx = (await this.db).transaction(["campaigns", "batches"], "readwrite");
    const current = await tx.objectStore("campaigns").get(id);
    if (!current) throw new StoreError(`no campaign ${id}`);
    const batches = (await tx.objectStore("batches").index("campaign").getAll(id)).sort((a, b) => a.batch - b.batch);
    checkNext(batches, batch);
    await tx.objectStore("batches").put({ ...batch, campaign: id });
    await tx.objectStore("campaigns").put({ ...current, ...meta });
    await tx.done;
  }

  async undo(id: string, meta: Partial<CampaignMeta>): Promise<StoredBatch | undefined> {
    const tx = (await this.db).transaction(["campaigns", "batches"], "readwrite");
    const current = await tx.objectStore("campaigns").get(id);
    if (!current) throw new StoreError(`no campaign ${id}`);
    const batches = await tx.objectStore("batches").index("campaign").getAllKeys(id);
    const last = batches.map((k) => k[1]).reduce((a, b) => Math.max(a, b), 0);
    if (last === 0) {
      await tx.done;
      return undefined;
    }
    const removed = await tx.objectStore("batches").get([id, last]);
    await tx.objectStore("batches").delete([id, last]);
    await tx.objectStore("campaigns").put({ ...current, ...meta });
    await tx.done;
    return removed && strip(removed);
  }

  async remove(id: string): Promise<void> {
    const tx = (await this.db).transaction(["campaigns", "batches"], "readwrite");
    for (const key of await tx.objectStore("batches").index("campaign").getAllKeys(id)) await tx.objectStore("batches").delete(key);
    await tx.objectStore("campaigns").delete(id);
    await tx.done;
  }
}

function strip({ campaign: _campaign, ...batch }: StoredBatch & { campaign: string }): StoredBatch {
  return batch;
}
