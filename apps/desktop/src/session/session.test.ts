import { d6Script } from "@osg/dice/testing";
import { fold } from "@osg/engine";
import { APPENDIX_B_DICE, APPENDIX_B_TURN_1, MERANTO_DEAL } from "@osg/engine/fixtures";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store";
import { CampaignSession, CommandRefused } from "./session";

let n = 0;
const options = () => ({ now: () => `2026-11-16T12:00:${String(n++ % 60).padStart(2, "0")}Z`, newId: () => "appendix-b" });
const NEW = { packId: "corentine", variant: "lighter", player: "essaveth", turns: 6, title: "" };

async function playTurn1(store = new MemoryStore()) {
  const session = await CampaignSession.create(store, NEW, { ...options(), rng: d6Script(...APPENDIX_B_DICE) });
  for (const command of APPENDIX_B_TURN_1) await session.run(command);
  return { store, session };
}

describe("CampaignSession", () => {
  it("creates a campaign named after the scenario and faction, stored as batch 0", async () => {
    const store = new MemoryStore();
    const session = await CampaignSession.create(store, NEW, options());
    expect(session.meta).toMatchObject({ id: "appendix-b", title: "The Corentine Succession: Essaveth", status: "setup", turn: 0 });
    expect((await store.list()).map((m) => m.id)).toEqual(["appendix-b"]);
    expect(session.state.seed).toBe("appendix-b");
  });

  it("plays Appendix B's Turn 1, one batch per command", async () => {
    const { session } = await playTurn1();
    expect(session.state).toMatchObject({ turn: 1, step: 8, turnOpen: false });
    expect(session.state.standing).toEqual(["meranto", "caldrath", "essaveth"]);
    expect(session.batches).toHaveLength(APPENDIX_B_TURN_1.length + 1);
    expect(session.batches.map((b) => b.command).slice(1)).toEqual(APPENDIX_B_TURN_1.map((c) => c.type));
    expect(session.meta).toMatchObject({ turn: 1, status: "playing" });
  });

  it("reopens from the store at every point with the same state", async () => {
    const { store, session } = await playTurn1();
    const reopened = await CampaignSession.open(store, "appendix-b");
    expect(reopened.state).toEqual(session.state);
    // and every prefix of the stored log is a valid game
    for (let i = 1; i <= session.batches.length; i++) {
      expect(() => fold(session.batches.slice(0, i).flatMap((b) => b.events))).not.toThrow();
    }
  });

  it("undoes across the turn boundary, back into the Report step, and persists it", async () => {
    const { store, session } = await playTurn1();
    expect(await session.undo()).toBe(true); // publishReport (and the TurnClosed it triggered)
    expect(session.state).toMatchObject({ turn: 1, step: 8, turnOpen: true });
    expect(session.requirements().decisions).toEqual([{ kind: "report" }]);
    const reopened = await CampaignSession.open(store, "appendix-b");
    expect(reopened.state).toEqual(session.state);
    expect(reopened.meta.turn).toBe(1);
  });

  it("undoes all the way to setup, and no further", async () => {
    const { session } = await playTurn1();
    while (await session.undo());
    expect(session.batches).toHaveLength(1);
    expect(session.state.status).toBe("setup");
    expect(await session.undo()).toBe(false);
  });

  it("can't reroll by undoing: redoing a command rolls the same dice", async () => {
    const store = new MemoryStore();
    const session = await CampaignSession.create(store, NEW, options()); // the real seeded Rng
    await session.run({ type: "startGame" });
    await session.run({ type: "openTurn" });
    await session.run({ type: "advance" });
    const offer = { type: "makeOffer", aa: "meranto", terms: MERANTO_DEAL, fit: { advancesObjective: true, costsProtectedOrHelpsRival: false } } as const;
    const first = (await session.run(offer)).find((e) => e.type === "OracleConsulted");
    await session.undo();
    const again = (await session.run(offer)).find((e) => e.type === "OracleConsulted");
    expect(again).toEqual(first);
  });

  it("refuses a command the engine refuses, and changes nothing", async () => {
    const store = new MemoryStore();
    const session = await CampaignSession.create(store, NEW, options());
    const before = session.getSnapshot();
    await expect(session.run({ type: "advance" })).rejects.toBeInstanceOf(CommandRefused);
    expect(session.getSnapshot()).toBe(before);
    expect((await store.load("appendix-b")).batches).toHaveLength(1);
  });

  it("runs commands one at a time: a double click can't run one twice", async () => {
    const store = new MemoryStore();
    const session = await CampaignSession.create(store, NEW, options());
    const results = await Promise.allSettled([session.run({ type: "startGame" }), session.run({ type: "startGame" })]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    expect(session.batches).toHaveLength(2);
  });

  it("keeps the state if the store fails", async () => {
    const store = new MemoryStore();
    const session = await CampaignSession.create(store, NEW, options());
    store.append = async () => {
      throw new Error("disk full");
    };
    await expect(session.run({ type: "startGame" })).rejects.toThrow("disk full");
    expect(session.state.status).toBe("setup");
  });

  it("notifies subscribers on every change", async () => {
    const session = await CampaignSession.create(new MemoryStore(), NEW, options());
    let calls = 0;
    const off = session.subscribe(() => calls++);
    await session.run({ type: "startGame" });
    await session.undo();
    off();
    await session.run({ type: "startGame" });
    expect(calls).toBe(2);
  });
});
