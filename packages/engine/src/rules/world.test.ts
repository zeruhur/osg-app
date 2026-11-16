import { createRng } from "@osg/dice";
import { d6Script } from "@osg/dice/testing";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { defaultClockLength, moveClock } from "./clock";
import { inspirationDisposition, inspirationEntry, inspirationTableFor, rollInspiration } from "./inspiration";
import { investigationResult, ownOneRevealsSecret, rollSecret } from "./secrets";
import { noticeOdds, rollSignal, signalFor } from "./signals";
import { isReordering, moveDown, moveUp } from "./standing";

describe("Signals and notice (solo_mode.qmd Part V, VI)", () => {
  it("reads 1-2 Silence, 3 Warning, 4 Offer, 5 Exposure, 6 Windfall", () => {
    expect([1, 2, 3, 4, 5, 6].map(signalFor)).toEqual(["silence", "silence", "warning", "offer", "exposure", "windfall"]);
  });

  it("Appendix B: Caldrath 3 -> Warning, Meranto 5 -> Exposure", () => {
    const rng = d6Script(3, 5);
    expect([rollSignal(rng).signal, rollSignal(rng).signal]).toEqual(["warning", "exposure"]);
  });

  it("asks 'Is it noticed?' at Unlikely, or Even with an Informational AA or an AA target", () => {
    expect(noticeOdds({ aaLeverage: [{ primary: "military" }], targetedAnAA: false })).toBe("unlikely");
    expect(noticeOdds({ aaLeverage: [{ primary: "economic", secondary: "informational" }], targetedAnAA: false })).toBe("even");
    expect(noticeOdds({ aaLeverage: [{ primary: "military" }], targetedAnAA: true })).toBe("even");
  });
});

describe("Secrets (solo_mode.qmd Part VI)", () => {
  it("bands an investigation: 6 two rolls (or one and a crumb), 4-5 private, 2-3 rumor, 1 nothing", () => {
    expect(investigationResult("especially-good")).toEqual({ rolls: 2, status: "private", orOnePlusCrumb: true });
    expect(investigationResult("success")).toEqual({ rolls: 1, status: "private" });
    expect(investigationResult("worse")).toEqual({ rolls: 1, status: "rumor" });
    expect(investigationResult("especially-bad")).toEqual({ rolls: 0 });
  });

  it("reveals a secret publicly on its own kept 1", () => {
    expect(ownOneRevealsSecret(1)).toBe(true);
    expect(ownOneRevealsSecret(2)).toBe(false);
  });

  it("rerolls duplicates", () => {
    expect(rollSecret(d6Script(2, 2, 5), [1])).toEqual({ index: 4, faces: [2, 2, 5] });
  });

  it("rolls nothing when every secret is out", () => {
    const rng = d6Script();
    expect(rollSecret(rng, [0, 1, 2, 3, 4, 5])).toBeUndefined();
  });

  it("always lands on an entry not yet uncovered (property)", () => {
    fc.assert(
      fc.property(fc.string(), fc.uniqueArray(fc.integer({ min: 0, max: 5 }), { maxLength: 5 }), (seed, uncovered) => {
        const r = rollSecret(createRng(seed), uncovered)!;
        expect(uncovered).not.toContain(r.index);
        expect(r.faces[r.faces.length - 1]).toBe(r.index + 1);
      })
    );
  });
});

describe("Crisis Clock (solo_mode.qmd Part VII)", () => {
  const corentine = { length: 4, position: 0, escalations: [2, 3, 4].map((box) => ({ box, landed: false })) };

  it("defaults to turns minus one", () => {
    expect(defaultClockLength(6)).toBe(5);
  });

  it("Appendix B: +1 at the end of Turn 1 -> 1/4, nothing lands; Turn 2 reaches Blood at the passes", () => {
    expect(moveClock(corentine, 1)).toEqual({ position: 1, landing: [] });
    expect(moveClock({ ...corentine, position: 1 }, 1)).toEqual({ position: 2, landing: [2] });
  });

  it("lands every escalation passed in one move, once", () => {
    expect(moveClock({ ...corentine, position: 1 }, 2)).toEqual({ position: 3, landing: [2, 3] });
    const after = { ...corentine, position: 3, escalations: corentine.escalations.map((e) => ({ ...e, landed: e.box <= 3 })) };
    expect(moveClock(after, -1)).toEqual({ position: 2, landing: [] });
    expect(moveClock({ ...after, position: 2 }, 1)).toEqual({ position: 3, landing: [] });
  });

  it("stays within 0..length (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4 }), fc.integer({ min: -6, max: 6 }), (position, delta) => {
        const { position: p } = moveClock({ ...corentine, position }, delta);
        expect(p >= 0 && p <= 4).toBe(true);
      })
    );
  });
});

describe("Inspiration Tables (solo_mode.qmd Part VIII)", () => {
  it("calls for Especially Good on a 6 and Especially Bad on a 1 only", () => {
    expect(inspirationTableFor("especially-good")).toBe("especiallyGood");
    expect(inspirationTableFor("especially-bad")).toBe("especiallyBad");
    expect(inspirationTableFor("success")).toBeUndefined();
  });

  it("Appendix B: Especially Good 4 -> Weakens a rival", () => {
    expect(rollInspiration("especiallyGood", d6Script(4))).toMatchObject({
      face: 4,
      text: "Weakens a rival: move the opposing faction down one place in Standing",
      effect: "rival-down"
    });
  });

  it("rolls the Force of Nature source table", () => {
    expect(inspirationEntry("forceOfNature", 3).text).toMatch(/^Popular unrest/);
  });

  it("moves an involved AA toward the player when the player acts", () => {
    expect(inspirationDisposition({ effect: "disposition-up", actor: "essaveth", player: "essaveth", involvedAA: "meranto" })).toEqual({
      aa: "meranto",
      delta: 1
    });
  });

  it("moves the acting AA only when it acted on the player", () => {
    expect(inspirationDisposition({ effect: "disposition-down", actor: "caldrath", player: "essaveth", actedOn: "essaveth" })).toEqual({
      aa: "caldrath",
      delta: -1
    });
    expect(inspirationDisposition({ effect: "disposition-down", actor: "caldrath", player: "essaveth", actedOn: "meranto" })).toBeUndefined();
    expect(inspirationDisposition({ effect: "rival-down", actor: "caldrath", player: "essaveth", actedOn: "essaveth" })).toBeUndefined();
  });
});

describe("Standing (solo_mode.qmd Part IV)", () => {
  const order = ["caldrath", "meranto", "essaveth"];

  it("Appendix B: Weakens a rival moves Caldrath down one -> Meranto, Caldrath, Essaveth", () => {
    expect(moveDown(order, "caldrath")).toEqual(["meranto", "caldrath", "essaveth"]);
  });

  it("moves up, and stays put at either end", () => {
    expect(moveUp(order, "essaveth")).toEqual(["caldrath", "essaveth", "meranto"]);
    expect(moveUp(order, "caldrath")).toEqual(order);
    expect(moveDown(order, "essaveth")).toEqual(order);
    expect(() => moveDown(order, "saivorn")).toThrow();
  });

  it("checks that a new order is a reordering of the same factions", () => {
    expect(isReordering(order, ["essaveth", "caldrath", "meranto"])).toBe(true);
    expect(isReordering(order, ["essaveth", "caldrath"])).toBe(false);
    expect(isReordering(order, ["essaveth", "essaveth", "meranto"])).toBe(false);
  });
});
