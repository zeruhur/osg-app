import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DispositionId } from "../types";
import { needsKeepCheck, dealKeepOdds, jointConfirmOdds, obligationReplacesTable, PLAYER_BREAK_DELTA } from "./deals";
import { SCALE, applyCauses, causesDelta, keepOdds, shiftDisposition, startingDisposition } from "./disposition";

const disposition = fc.constantFrom<DispositionId>("hostile", "wary", "neutral", "open", "allied");

describe("disposition (solo_mode.qmd Part V)", () => {
  it("runs Hostile to Allied", () => {
    expect(SCALE).toEqual(["hostile", "wary", "neutral", "open", "allied"]);
  });

  it("never moves past Hostile or Allied (property)", () => {
    fc.assert(
      fc.property(disposition, fc.integer({ min: -10, max: 10 }), (d, delta) => {
        expect(SCALE).toContain(shiftDisposition(d, delta));
      })
    );
    expect(shiftDisposition("hostile", -1)).toBe("hostile");
    expect(shiftDisposition("allied", 2)).toBe("allied");
  });

  it("applies +1 / -1 / -2, each cause once", () => {
    expect(causesDelta({ keptDealOrBenefited: true })).toBe(1);
    expect(causesDelta({ harmedOrUncoveredCovert: true })).toBe(-1);
    expect(causesDelta({ brokeDeal: true })).toBe(-2);
    expect(causesDelta({ keptDealOrBenefited: true, harmedOrUncoveredCovert: true, brokeDeal: true })).toBe(-2);
  });

  it("Appendix B: Meranto Neutral -> Open (kept deal); Caldrath Hostile stays Hostile (harmed, at the floor)", () => {
    expect(applyCauses("neutral", { keptDealOrBenefited: true })).toBe("open");
    expect(applyCauses("hostile", { harmedOrUncoveredCovert: true })).toBe("hostile");
  });

  it("starts Wary on conflicting objectives, Open on aligned ones, Neutral otherwise", () => {
    expect(startingDisposition("conflict")).toBe("wary");
    expect(startingDisposition("align")).toBe("open");
    expect(startingDisposition("neither")).toBe("neutral");
  });
});

describe("deals (solo_mode.qmd Part V, Deals)", () => {
  it("keep odds come from disposition: Wary Even, Neutral and Open Likely, Allied automatic", () => {
    expect(SCALE.map((d) => keepOdds(d, "aggressor"))).toEqual(["unlikely", "even", "likely", "likely", "automatic"]);
  });

  it("an Allied Schemer keeps at Likely, not automatically", () => {
    expect(keepOdds("allied", "schemer")).toBe("likely");
    expect(dealKeepOdds("neutral", "schemer")).toBe("likely");
  });

  it("uses Unlikely for a Hostile AA holding a deal (A9)", () => {
    expect(keepOdds("hostile", "schemer")).toBe("unlikely");
  });

  it("checks every turn for a Schemer, otherwise only when keeping it costs something real", () => {
    expect(needsKeepCheck("schemer", false)).toBe(true);
    expect(needsKeepCheck("aggressor", false)).toBe(false);
    expect(needsKeepCheck("aggressor", true)).toBe(true);
  });

  it("lets an 'act' obligation replace the table roll; a 'refrain' one does not", () => {
    expect(obligationReplacesTable([{ kind: "refrain", description: "not attack Essaveth" }], 1)).toBeUndefined();
    expect(obligationReplacesTable([{ kind: "act", description: "delay the loan" }], 1)?.description).toBe("delay the loan");
    expect(obligationReplacesTable([{ kind: "act", description: "delay the loan", turn: 1 }], 2)).toBeUndefined();
  });

  it("drops disposition by 2 when the player breaks a deal; joint actions confirm at Likely, Allied automatically", () => {
    expect(PLAYER_BREAK_DELTA).toBe(-2);
    expect(jointConfirmOdds("neutral")).toBe("likely");
    expect(jointConfirmOdds("allied")).toBe("automatic");
  });
});
