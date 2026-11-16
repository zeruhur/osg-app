import { describe, expect, it } from "vitest";
import {
  STANDARD_LEVERAGE,
  behaviorRules,
  core,
  d66Row,
  disposition,
  faceRow,
  generator,
  genericActions,
  genericSecrets,
  inspiration,
  offerResults,
  packs,
  rangeRow,
  signals
} from "./index";
import { ScenarioPack } from "./schemas";

describe("core tables", () => {
  it("keeps the higher die on Strong and the lower on Weak", () => {
    expect(core.leverage.rows.map((r) => [r.grade, r.keep])).toEqual([
      ["strong", "high"],
      ["weak", "low"]
    ]);
  });

  it("bands results 6 / 4-5 / 2-3 / 1", () => {
    expect([6, 5, 4, 3, 2, 1].map((v) => rangeRow(core.results.rows, v).id)).toEqual([
      "especially-good",
      "success",
      "success",
      "worse",
      "worse",
      "especially-bad"
    ]);
  });

  it("maps Oracle faces 6..1 to Yes-and .. No-and, and odds to rolls", () => {
    expect([6, 5, 4, 3, 2, 1].map((f) => faceRow(core.oracleAnswers.rows, f).id)).toEqual([
      "yes-and",
      "yes",
      "yes-but",
      "no-but",
      "no",
      "no-and"
    ]);
    expect(core.oracleOdds.rows.map((r) => [r.id, r.roll])).toEqual([
      ["likely", { dice: 2, keep: "high" }],
      ["even", { dice: 1 }],
      ["unlikely", { dice: 2, keep: "low" }]
    ]);
  });
});

describe("Solo Mode tables", () => {
  it("has the six behavior rules in d6 order", () => {
    expect(behaviorRules.rows.map((r) => r.id)).toEqual(["consolidator", "aggressor", "opportunist", "balancer", "reactor", "schemer"]);
  });

  it("orders disposition Hostile to Allied, with the deal-keeping odds", () => {
    expect(disposition.rows.map((r) => [r.id, r.keepOdds, r.schemerKeepOdds])).toEqual([
      ["hostile", "none", undefined],
      ["wary", "even", undefined],
      ["neutral", "likely", undefined],
      ["open", "likely", undefined],
      ["allied", "automatic", "likely"]
    ]);
  });

  it("lists Offer results in answer order", () => {
    expect(offerResults.rows.map((r) => r.id)).toEqual(["yes-and", "yes", "yes-but", "no-but", "no", "no-and"]);
  });

  it("reads Signals by d6", () => {
    expect([1, 2, 3, 4, 5, 6].map((f) => rangeRow(signals.rows, f).id)).toEqual([
      "silence",
      "silence",
      "warning",
      "offer",
      "exposure",
      "windfall"
    ]);
  });

  it("has a generic Secret and Action table for every standard leverage type", () => {
    for (const l of STANDARD_LEVERAGE) {
      expect(genericSecrets[l].entries).toHaveLength(6);
      expect(genericActions[l].entries).toHaveLength(6);
    }
  });

  it("puts [target] in rows 3 and 4 of every generic Action table, and nowhere but 3, 4, 6", () => {
    // solo_mode.qmd Part IV, The Action Table: 3-4 are moves against a [target]; 6 is escalation.
    for (const l of STANDARD_LEVERAGE) {
      const faces = genericActions[l].entries.flatMap((e, i) => (e.includes("[target]") ? [i + 1] : []));
      expect(faces, l).toEqual(expect.arrayContaining([3, 4]));
      expect(faces.every((f) => f === 3 || f === 4 || f === 6), l).toBe(true);
    }
  });

  it("tags the mechanical Inspiration entries", () => {
    expect(inspiration.especiallyGood.rows.map((r) => r.effect)).toEqual([
      undefined,
      "roll-secret",
      undefined,
      "rival-down",
      "disposition-up",
      "clock-back"
    ]);
    expect(inspiration.especiallyBad.rows.map((r) => r.effect)).toEqual([
      "exposed",
      "disposition-down",
      "lose-asset",
      "rival-up",
      "add-vulnerability",
      "clock-forward"
    ]);
  });
});

describe("scenario generator", () => {
  it("reads d66 as tens then units (Appendix C: a 3 then a 5 is 35)", () => {
    expect(d66Row(generator.event, 35)).toMatchObject({
      category: { category: "Discovery and arrival" },
      row: { text: "A new technique makes an old monopoly worthless" }
    });
    expect(d66Row(generator.archetype, 31).category.leverage).toBe("geographic");
  });

  it("covers every d66 roll exactly once in each d66 table", () => {
    const all: number[] = [];
    for (let t = 1; t <= 6; t++) for (let u = 1; u <= 6; u++) all.push(t * 10 + u);
    for (const table of [generator.event, generator.absence, generator.archetype]) {
      expect(table.flatMap((c) => c.rows.map((r) => r.roll))).toEqual(all);
    }
  });

  it("gives each Stance its suggested behavior rule", () => {
    expect(generator.stance.rows.map((r) => [r.id, r.behavior])).toEqual([
      ["claimant", "aggressor"],
      ["guardian", "balancer"],
      ["threatened", "consolidator"],
      ["opportunist", "opportunist"],
      ["creditor", "schemer"],
      ["outsider", "reactor"]
    ]);
  });
});

describe("Corentine pack (Appendix A)", () => {
  const pack = packs.corentine!;
  const faction = (id: string) => pack.factions.find((f) => f.id === id)!;

  it("has five factions and two variants, the lighter one recommended", () => {
    expect(pack.factions.map((f) => f.id)).toEqual(["saivorn", "caldrath", "conclave", "essaveth", "meranto"]);
    expect(pack.variants.find((v) => v.recommended)?.id).toBe("lighter");
  });

  it("starts the lighter game as Appendix B does", () => {
    const lighter = pack.variants.find((v) => v.id === "lighter")!;
    expect(lighter.standing).toEqual(["caldrath", "meranto", "essaveth"]);
    expect(lighter.background).toEqual(["saivorn", "conclave"]);
    expect(faction("caldrath").asAA.behavior).toBe("aggressor");
    expect(faction("meranto").asAA.behavior).toBe("schemer");
    expect(pack.startingDisposition.caldrath!.essaveth).toBe("hostile");
    expect(pack.startingDisposition.meranto!.essaveth).toBe("neutral");
    expect(faction("essaveth").asPlayer.bonus).toMatchObject({ name: "The Pass Wardens", uses: 2 });
    expect(faction("caldrath").asAA.actionTable[2]).toBe("Demand right of passage from [target], backed by the army");
  });

  it("fixes the Clock at four boxes, the Breaking Point on the last", () => {
    expect(pack.clock.length).toBe(4);
    expect(pack.clock.escalations.map((e) => [e.box, e.breakingPoint])).toEqual([
      [2, false],
      [3, false],
      [4, true]
    ]);
  });

  it("keeps a scenario-specific leverage type (Essaveth: diplomatic)", () => {
    expect(faction("essaveth").asAA.leverage).toEqual({ primary: "geographic", secondary: "diplomatic" });
  });

  it("rejects a pack whose standing names a background faction", () => {
    const broken = structuredClone(pack);
    broken.variants[1]!.standing = ["caldrath", "meranto", "saivorn"];
    expect(ScenarioPack.safeParse(broken).success).toBe(false);
  });

  it("rejects a pack whose Breaking Point is not on the last box", () => {
    const broken = structuredClone(pack);
    broken.clock.length = 5;
    expect(ScenarioPack.safeParse(broken).success).toBe(false);
  });

  it("rejects an unknown field", () => {
    expect(ScenarioPack.safeParse({ ...pack, extra: true }).success).toBe(false);
  });
});
