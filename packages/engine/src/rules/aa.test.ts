import { describe, expect, it } from "vitest";
import { aaSpendsBonus, adaptationTriggers, afterVeto, fillTarget, holds, newPowerOdds, ruleTarget } from "./aa";

const standing = ["caldrath", "meranto", "saivorn", "conclave", "essaveth"];

describe("holding (solo_mode.qmd Part IV, Behavior Rules)", () => {
  const base = { turn: 1, actedUponLastTurn: false };

  it("Schemer acts on odd turns and holds on even turns (Appendix B: Meranto acts on Turn 1)", () => {
    expect(holds({ ...base, behavior: "schemer" })).toEqual({ holds: false });
    expect(holds({ ...base, behavior: "schemer", turn: 2 })).toMatchObject({ holds: true });
  });

  it("Reactor holds until acted upon", () => {
    expect(holds({ ...base, behavior: "reactor" })).toMatchObject({ holds: true });
    expect(holds({ ...base, behavior: "reactor", actedUponLastTurn: true })).toEqual({ holds: false });
  });

  it("Consolidator asks whether it has something to defend", () => {
    expect(holds({ ...base, behavior: "consolidator" })).toEqual({ needs: "consolidatorThreat" });
    expect(holds({ ...base, behavior: "consolidator", threatenedInLastReport: false })).toMatchObject({ holds: true });
    expect(holds({ ...base, behavior: "consolidator", threatenedInLastReport: true })).toEqual({ holds: false });
  });

  it("Aggressor, Opportunist and Balancer never hold by their own rule", () => {
    for (const behavior of ["aggressor", "opportunist", "balancer"] as const) {
      expect(holds({ ...base, behavior, turn: 2 })).toEqual({ holds: false });
    }
  });
});

describe("[target] (solo_mode.qmd Part IV, The Action Table)", () => {
  it("Opportunist targets the lowest on Standing, Balancer the highest", () => {
    expect(ruleTarget("opportunist", "saivorn", standing)).toBe("essaveth");
    expect(ruleTarget("balancer", "saivorn", standing)).toBe("caldrath");
  });

  it("never targets itself: it takes the next faction in from that end (A10)", () => {
    expect(ruleTarget("opportunist", "essaveth", standing)).toBe("conclave");
    expect(ruleTarget("balancer", "caldrath", standing)).toBe("meranto");
  });

  it("Reactor targets the faction that last affected it; other rules name no target", () => {
    expect(ruleTarget("reactor", "saivorn", standing, "meranto")).toBe("meranto");
    expect(ruleTarget("reactor", "saivorn", standing)).toBeUndefined();
    expect(ruleTarget("aggressor", "caldrath", standing)).toBeUndefined();
  });

  const input = { self: "caldrath", behavior: "aggressor" as const, player: "essaveth", standing };

  it("Appendix B: Caldrath, Aggressor and Hostile -> Essaveth, without asking", () => {
    expect(fillTarget({ ...input, disposition: "hostile" })).toMatchObject({ kind: "filled", target: "essaveth" });
  });

  it("a rule-named target wins over disposition", () => {
    expect(fillTarget({ ...input, behavior: "balancer", self: "saivorn", disposition: "hostile" })).toMatchObject({
      kind: "filled",
      target: "caldrath"
    });
  });

  it("otherwise asks who is most in the way, with the disposition tie-break", () => {
    expect(fillTarget({ ...input, disposition: "neutral" })).toEqual({ kind: "choose", candidates: ["meranto", "saivorn", "conclave", "essaveth"] });
    expect(fillTarget({ ...input, disposition: "wary" })).toMatchObject({ kind: "choose", prefer: "essaveth" });
    expect(fillTarget({ ...input, disposition: "open" })).toMatchObject({ kind: "choose", avoid: "essaveth" });
    expect(fillTarget({ ...input, disposition: "allied" })).toEqual({ kind: "choose", candidates: ["meranto", "saivorn", "conclave"] });
  });

  it("an Allied AA still targets you when its rule forces it", () => {
    expect(fillTarget({ ...input, self: "saivorn", behavior: "opportunist", disposition: "allied" })).toMatchObject({
      kind: "filled",
      target: "essaveth"
    });
  });

  it("after noticing your covert action, its next target is you (Part VI)", () => {
    expect(fillTarget({ ...input, self: "saivorn", behavior: "balancer", disposition: "allied", forcedOnPlayer: true })).toMatchObject({
      kind: "filled",
      target: "essaveth"
    });
  });
});

describe("veto, bonus, adaptation, new powers", () => {
  it("rerolls once, then writes from the rule", () => {
    expect(afterVeto(false)).toBe("reroll");
    expect(afterVeto(true)).toBe("write-from-rule");
  });

  it("spends an AA bonus in scope on Weak leverage or in a conflict", () => {
    const base = { usesLeft: 1, inScope: true };
    expect(aaSpendsBonus({ ...base, grade: "weak", inConflict: false })).toBe(true);
    expect(aaSpendsBonus({ ...base, grade: "strong", inConflict: true })).toBe(true);
    expect(aaSpendsBonus({ ...base, grade: "strong", inConflict: false })).toBe(false);
    expect(aaSpendsBonus({ ...base, inScope: false, grade: "weak", inConflict: true })).toBe(false);
    expect(aaSpendsBonus({ ...base, usesLeft: 0, grade: "weak", inConflict: true })).toBe(false);
  });

  it("triggers Adaptation on a kept 6 or 1 and on objective changes, one each (A5)", () => {
    expect(adaptationTriggers({ keptDice: [4] })).toEqual([]);
    expect(adaptationTriggers({ keptDice: [6] })).toEqual(["kept-6-or-1"]);
    expect(adaptationTriggers({ keptDice: [1, 6], objectiveAchieved: true })).toEqual(["kept-6-or-1", "objective-achieved"]);
    expect(adaptationTriggers({ keptDice: [], objectiveImpossible: true })).toEqual(["objective-impossible"]);
  });

  it("asks about a new power at Likely if what it held still matters", () => {
    expect(newPowerOdds(true)).toBe("likely");
    expect(newPowerOdds(false)).toBe("even");
  });
});
