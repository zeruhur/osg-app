import type { GameEvent } from "@osg/engine";
import Database from "@tauri-apps/plugin-sql";
import { StoreError, byUpdated, checkNext, type CampaignMeta, type CampaignStore, type LoadedCampaign, type StoredBatch } from "./types";

/** Desktop store (Tauri SQL plugin). One SQLite file per campaign holds its log
 * (`campaign-<id>.sqlite` in the app config dir); a small index database lists the campaigns.
 *
 * The plugin runs each statement on a pooled connection, so a transaction can't span calls.
 * Instead a batch's events are written first and its `batches` row last, as a commit marker:
 * loading ignores events whose batch has no row, and the next append clears them. A crash
 * mid-write therefore loses at most the batch being written, never corrupts the log. */
export class SqliteStore implements CampaignStore {
  private index?: Promise<Database>;
  private open = new Map<string, Promise<Database>>();

  private async indexDb(): Promise<Database> {
    this.index ??= (async () => {
      const db = await Database.load("sqlite:osg-solo.sqlite");
      await db.execute("CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, json TEXT NOT NULL)");
      return db;
    })();
    return this.index;
  }

  private async campaignDb(id: string): Promise<Database> {
    if (!/^[A-Za-z0-9-]+$/.test(id)) throw new StoreError(`invalid campaign id ${id}`);
    let db = this.open.get(id);
    if (!db) {
      db = (async () => {
        const d = await Database.load(`sqlite:campaign-${id}.sqlite`);
        await d.execute("CREATE TABLE IF NOT EXISTS batches (batch INTEGER PRIMARY KEY, command TEXT NOT NULL, at TEXT NOT NULL)");
        await d.execute("CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, batch INTEGER NOT NULL, json TEXT NOT NULL)");
        return d;
      })();
      this.open.set(id, db);
    }
    return db;
  }

  async list(): Promise<CampaignMeta[]> {
    const rows = await (await this.indexDb()).select<{ json: string }[]>("SELECT json FROM campaigns");
    return rows.map((r) => JSON.parse(r.json) as CampaignMeta).sort(byUpdated);
  }

  async create(meta: CampaignMeta, setup: GameEvent[]): Promise<void> {
    const index = await this.indexDb();
    const existing = await index.select<{ id: string }[]>("SELECT id FROM campaigns WHERE id = $1", [meta.id]);
    if (existing.length) throw new StoreError(`campaign ${meta.id} already exists`);
    await this.writeBatch(meta.id, { batch: 0, command: "setup", at: meta.createdAt, events: setup });
    await index.execute("INSERT INTO campaigns (id, json) VALUES ($1, $2)", [meta.id, JSON.stringify(meta)]);
  }

  async load(id: string): Promise<LoadedCampaign> {
    const meta = await this.meta(id);
    const db = await this.campaignDb(id);
    const rows = await db.select<{ batch: number; command: string; at: string }[]>("SELECT batch, command, at FROM batches ORDER BY batch");
    const events = await db.select<{ batch: number; json: string }[]>("SELECT batch, json FROM events ORDER BY seq");
    const byBatch = new Map<number, GameEvent[]>();
    for (const e of events) {
      const list = byBatch.get(e.batch) ?? [];
      list.push(JSON.parse(e.json) as GameEvent);
      byBatch.set(e.batch, list);
    }
    if (rows[0]?.batch !== 0) throw new StoreError(`the log of campaign "${meta.title}" is missing its setup; delete the campaign`);
    return { meta, batches: rows.map((r) => ({ batch: r.batch, command: r.command, at: r.at, events: byBatch.get(r.batch) ?? [] })) };
  }

  async append(id: string, batch: StoredBatch, meta: Partial<CampaignMeta>): Promise<void> {
    const { batches } = await this.load(id);
    checkNext(batches, batch);
    await this.writeBatch(id, batch);
    await this.updateMeta(id, meta);
  }

  async undo(id: string, meta: Partial<CampaignMeta>): Promise<StoredBatch | undefined> {
    const { batches } = await this.load(id);
    const last = batches.at(-1);
    if (!last || last.batch === 0) return undefined;
    const db = await this.campaignDb(id);
    // Marker first: once the batch row is gone, its events no longer load.
    await db.execute("DELETE FROM batches WHERE batch = $1", [last.batch]);
    await db.execute("DELETE FROM events WHERE batch >= $1", [last.batch]);
    await this.updateMeta(id, meta);
    return last;
  }

  async remove(id: string): Promise<void> {
    // Index row first: once it is gone the campaign is gone from the list, even if clearing its
    // file fails below.
    await (await this.indexDb()).execute("DELETE FROM campaigns WHERE id = $1", [id]);
    const db = await this.campaignDb(id);
    // The file itself stays (no filesystem access from the webview); its tables go.
    await db.execute("DROP TABLE IF EXISTS events");
    await db.execute("DROP TABLE IF EXISTS batches");
    this.open.delete(id);
    // Name the pool: the plugin's close() with no argument closes every database, the index too.
    await db.close(db.path);
  }

  private async writeBatch(id: string, batch: StoredBatch): Promise<void> {
    const db = await this.campaignDb(id);
    // Clear events left by an interrupted write of this batch, then events, then the marker.
    await db.execute("DELETE FROM events WHERE batch >= $1", [batch.batch]);
    if (batch.events.length) {
      const values = batch.events.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
      await db.execute(
        `INSERT INTO events (seq, batch, json) VALUES ${values}`,
        batch.events.flatMap((e) => [e.seq, batch.batch, JSON.stringify(e)])
      );
    }
    await db.execute("INSERT INTO batches (batch, command, at) VALUES ($1, $2, $3)", [batch.batch, batch.command, batch.at]);
  }

  private async meta(id: string): Promise<CampaignMeta> {
    const rows = await (await this.indexDb()).select<{ json: string }[]>("SELECT json FROM campaigns WHERE id = $1", [id]);
    if (!rows[0]) throw new StoreError(`no campaign ${id}`);
    return JSON.parse(rows[0].json) as CampaignMeta;
  }

  private async updateMeta(id: string, patch: Partial<CampaignMeta>): Promise<void> {
    const meta = { ...(await this.meta(id)), ...patch };
    await (await this.indexDb()).execute("UPDATE campaigns SET json = $1 WHERE id = $2", [JSON.stringify(meta), id]);
  }
}
