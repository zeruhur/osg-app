import { setupGame, type GameEvent } from "@osg/engine";
import { packs } from "@osg/rules-data";
import { describe, expect, it } from "vitest";
import { IndexedDbStore } from "./indexeddb";
import { MemoryStore } from "./memory";
import type { CampaignMeta, CampaignStore, StoredBatch } from "./types";

const setup = setupGame(packs.corentine!, { variant: "lighter", player: "essaveth", seed: "store-test" });

const meta = (id: string, updatedAt = "2026-11-16T10:00:00Z"): CampaignMeta => ({
  id,
  title: `Campaign ${id}`,
  packId: "corentine",
  packTitle: "The Corentine Succession",
  variant: "lighter",
  player: "essaveth",
  playerName: "Essaveth",
  turns: 6,
  turn: 0,
  status: "setup",
  createdAt: "2026-11-16T10:00:00Z",
  updatedAt
});

const fakeBatch = (batch: number, firstSeq: number, n = 2): StoredBatch => ({
  batch,
  command: `cmd-${batch}`,
  at: "2026-11-16T11:00:00Z",
  events: Array.from({ length: n }, (_, i) => ({ type: "GameStarted", seq: firstSeq + i, turn: 0, step: 0, author: "player" }) as GameEvent)
});

let dbCounter = 0;
const stores: [string, () => CampaignStore][] = [
  ["memory", () => new MemoryStore()],
  ["IndexedDB", () => new IndexedDbStore(`osg-test-${++dbCounter}`)]
];

describe.each(stores)("CampaignStore contract: %s", (_, make) => {
  it("creates a campaign with its setup as batch 0, and loads it back", async () => {
    const store = make();
    await store.create(meta("a"), setup);
    const loaded = await store.load("a");
    expect(loaded.meta).toEqual(meta("a"));
    expect(loaded.batches).toEqual([{ batch: 0, command: "setup", at: "2026-11-16T10:00:00Z", events: setup }]);
  });

  it("refuses to create the same id twice, and to load an unknown one", async () => {
    const store = make();
    await store.create(meta("a"), setup);
    await expect(store.create(meta("a"), setup)).rejects.toThrow(/already exists/);
    await expect(store.load("zzz")).rejects.toThrow(/no campaign/);
  });

  it("appends batches in order and updates the meta", async () => {
    const store = make();
    await store.create(meta("a"), setup);
    await store.append("a", fakeBatch(1, setup.length), { turn: 1, status: "playing" });
    await store.append("a", fakeBatch(2, setup.length + 2), { turn: 2 });
    const loaded = await store.load("a");
    expect(loaded.batches.map((b) => b.batch)).toEqual([0, 1, 2]);
    expect(loaded.batches.flatMap((b) => b.events).map((e) => e.seq)).toEqual(Array.from({ length: setup.length + 4 }, (_, i) => i));
    expect(loaded.meta).toMatchObject({ turn: 2, status: "playing" });
  });

  it("rejects a batch out of order or with a gap in seq", async () => {
    const store = make();
    await store.create(meta("a"), setup);
    await expect(store.append("a", fakeBatch(2, setup.length), {})).rejects.toThrow(/expected batch 1/);
    await expect(store.append("a", fakeBatch(1, setup.length + 5), {})).rejects.toThrow(/expected/);
    expect((await store.load("a")).batches).toHaveLength(1);
  });

  it("undoes the last batch, one at a time, never the setup", async () => {
    const store = make();
    await store.create(meta("a"), setup);
    await store.append("a", fakeBatch(1, setup.length), { turn: 1 });
    await store.append("a", fakeBatch(2, setup.length + 2), { turn: 2 });
    expect((await store.undo("a", { turn: 1 }))?.batch).toBe(2);
    expect((await store.load("a")).meta.turn).toBe(1);
    expect((await store.undo("a", { turn: 0 }))?.batch).toBe(1);
    expect(await store.undo("a", {})).toBeUndefined();
    expect((await store.load("a")).batches.map((b) => b.batch)).toEqual([0]);
    // and the log can grow again from there
    await store.append("a", fakeBatch(1, setup.length), {});
    expect((await store.load("a")).batches).toHaveLength(2);
  });

  it("lists campaigns, most recently played first, and removes them", async () => {
    const store = make();
    await store.create(meta("old", "2026-11-01T00:00:00Z"), setup);
    await store.create(meta("new", "2026-11-15T00:00:00Z"), setup);
    expect((await store.list()).map((m) => m.id)).toEqual(["new", "old"]);
    await store.remove("new");
    expect((await store.list()).map((m) => m.id)).toEqual(["old"]);
    await expect(store.load("new")).rejects.toThrow();
  });

  it("returns copies: changing a loaded batch doesn't change the store", async () => {
    const store = make();
    await store.create(meta("a"), setup);
    const loaded = await store.load("a");
    loaded.batches[0]!.events.length = 0;
    expect((await store.load("a")).batches[0]!.events).toHaveLength(setup.length);
  });
});
