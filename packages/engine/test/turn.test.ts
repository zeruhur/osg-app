import { d6Script } from "@osg/dice/testing";
import { describe, expect, it } from "vitest";
import { EngineError } from "../src/errors";
import { applyEvent, fold } from "../src/fold";
import { nextRequired } from "../src/turn";
import { MERANTO_DEAL, playAppendixBTurn1, APPENDIX_B_DICE } from "./appendix-b";
import { Game, appendixBSetup } from "./helpers";

const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return e instanceof EngineError ? e.code : `not an EngineError: ${String(e)}`;
  }
  return "no error";
};

/** A started game at the start of step 2 of Turn 1. */
function atTalk(...dice: number[]) {
  const g = new Game(appendixBSetup(), d6Script(...dice));
  g.do({ type: "startGame" });
  g.do({ type: "openTurn" });
  g.do({ type: "advance" });
  return g;
}

describe("a scripted turn (Appendix B, Turn 1)", () => {
  it("reaches TurnClosed, using every scripted die", () => {
    const rng = d6Script(...APPENDIX_B_DICE);
    const g = playAppendixBTurn1(rng);
    expect(g.log[g.log.length - 1]!.type).toBe("TurnClosed");
    expect(g.state).toMatchObject({ turn: 1, step: 8, turnOpen: false });
    expect(rng.remaining).toBe(0);
    expect(nextRequired(g.state).decisions).toEqual([{ kind: "openTurn" }]);
  });

  it("passes through every step in order, each step's events stamped with it", () => {
    const g = playAppendixBTurn1();
    const steps = g.log.filter((e) => e.turn === 1).map((e) => e.step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it("rolls only in the engine, and records every roll's position", () => {
    const g = playAppendixBTurn1();
    const rolls = g.log.flatMap((e) => ("roll" in e && e.roll ? [e.roll] : []));
    expect(rolls.flatMap((r) => r.faces)).toEqual(APPENDIX_B_DICE);
    expect(rolls.map((r) => r.position)).toEqual([0, 2, 3, 5, 7, 9, 10, 11]);
    expect(g.log.filter((e) => "roll" in e).every((e) => e.author === "engine")).toBe(true);
  });
});

describe("decision points block the turn", () => {
  it("can't advance past Talk with an Offer waiting for its condition", () => {
    const g = atTalk(2, 4);
    g.do({ type: "makeOffer", aa: "meranto", terms: MERANTO_DEAL, fit: { advancesObjective: true, costsProtectedOrHelpsRival: false } });
    expect(g.kinds()).toEqual(["settleOffer"]);
    expect(code(() => g.do({ type: "advance" }))).toBe("out-of-order");
  });

  it("allows one Offer per AA per turn", () => {
    const g = atTalk(6, 6, 6, 6);
    g.do({ type: "makeOffer", aa: "meranto", terms: MERANTO_DEAL, fit: { advancesObjective: false, costsProtectedOrHelpsRival: false } });
    expect(code(() => g.do({ type: "makeOffer", aa: "meranto", terms: MERANTO_DEAL, fit: { advancesObjective: true, costsProtectedOrHelpsRival: false } }))).toBe("invalid");
  });

  it("refuses a Hostile AA's Offer without rolling", () => {
    const g = atTalk();
    g.do({ type: "makeOffer", aa: "caldrath", terms: { text: "peace", obligations: {} }, fit: { advancesObjective: false, costsProtectedOrHelpsRival: false } });
    expect(g.state.current.offers["o1-caldrath"]).toMatchObject({ odds: "refused", followUp: "refuse", settled: true });
  });

  it("won't let AAs act, or anything be rolled for them, before the player's action is locked", () => {
    const g = atTalk();
    g.do({ type: "advance" });
    expect(g.kinds()).toEqual(["declare"]);
    expect(code(() => g.do({ type: "advance" }))).toBe("out-of-order");
    expect(code(() => g.do({ type: "writeAAAction", aa: "caldrath", action: { act: "x", out: "x", lev: "x" } }))).toBe("out-of-order");
    expect(g.log.some((e) => e.type === "AATableRolled")).toBe(false);
  });

  it("locks the player's action: no second declaration", () => {
    const g = atTalk();
    g.do({ type: "advance" });
    g.do({ type: "declareAction", action: { act: "a", out: "b", lev: "c" } });
    expect(code(() => g.do({ type: "declareAction", action: { act: "a2", out: "b", lev: "c" } }))).toBe("out-of-order");
  });

  it("rejects a bonus the player doesn't have", () => {
    const g = atTalk();
    g.do({ type: "advance" });
    expect(code(() => g.do({ type: "declareAction", action: { act: "a", out: "b", lev: "c", bonus: "The Debt Clause" } }))).toBe("invalid");
  });

  it("never lets a grade change after its roll", () => {
    const g = playAppendixBTurn1();
    const rolled = g.log.findIndex((e) => e.type === "DiceRolled" && e.action === "a1-essaveth");
    const before = fold(g.log.slice(0, rolled + 1));
    const regrade = { type: "LeverageGraded", action: "a1-essaveth", grade: "weak", source: "player", seq: before.nextSeq, turn: 1, step: 5, author: "player" } as const;
    expect(code(() => applyEvent(before, regrade))).toBe("out-of-order");
  });

  it("asks for every grade before rolling anything in a group", () => {
    const all = playAppendixBTurn1();
    const classified = all.log.findIndex((e) => e.type === "ActionsClassified");
    const partial = new Game(all.log.slice(0, classified + 1));
    expect(partial.kinds()).toEqual(expect.arrayContaining(["bothCanBeTrue", "grade", "grade"]));
    expect(partial.state.current.adjudication["a1-essaveth"]!.rolled).toBeUndefined();
  });

  it("checks commands against the open decision", () => {
    const g = atTalk();
    expect(code(() => g.do({ type: "grade", action: "a1-essaveth", grade: "strong" }))).toBe("out-of-order");
    expect(code(() => g.do({ type: "openTurn" }))).toBe("out-of-order");
  });
});

/** From step 2: no Offers, declare the player's action, and move on to step 4 (AA actions). */
function quickTurn(g: Game, declare: Parameters<Game["do"]>[0] & { type: "declareAction" }) {
  g.do({ type: "advance" });
  g.do(declare);
  g.do({ type: "advance" });
}

describe("step 4 branches", () => {
  it("holds a Schemer on an even turn, and makes the hold an unopposed action", () => {
    const g = new Game(playAppendixBTurn1().log, d6Script(1, 6, 6, 6, 6, 6, 6));
    g.do({ type: "openTurn" });
    g.do({ type: "advance" });
    quickTurn(g, { type: "declareAction", action: { act: "a", out: "b", lev: "c" } });
    // Caldrath rolls (1 -> "March a column through the northern passes toward Corenth"), no target.
    expect(g.decisions()).toEqual([{ kind: "writeAAAction", aa: "caldrath", source: "table", entry: "March a column through the northern passes toward Corenth", target: undefined }]);
    g.do({ type: "writeAAAction", aa: "caldrath", action: { act: "March", out: "Through", lev: "Army" } });
    expect(g.state.current.aa.meranto!.held).toBe("Schemer on an even turn");
    expect(g.state.current.actions["a2-meranto"]!.source).toBe("hold");
    expect(nextRequired(g.state).canAdvance).toBe(true);
  });

  it("vetoes once (reroll), then a second veto means writing from the behavior rule", () => {
    const g = atTalk(1, 2);
    quickTurn(g, { type: "declareAction", action: { act: "a", out: "b", lev: "c" } });
    expect(g.state.current.aa.caldrath!.table!.index).toBe(0);
    g.do({ type: "vetoEntry", aa: "caldrath" });
    expect(g.state.current.aa.caldrath).toMatchObject({ table: { index: 1 }, rolls: 2, vetoes: 1 });
    g.do({ type: "vetoEntry", aa: "caldrath" });
    expect(g.decisions()).toEqual([{ kind: "writeAAAction", aa: "caldrath", source: "rule" }]);
  });

  it("an AA that breaks a deal acts to exploit the break", () => {
    // Offer accepted (Likely [6,6] -> Yes, and), then Meranto's keep check fails (Likely [1,1] -> No, and).
    const g = atTalk(6, 6, 1, 3, 1, 1);
    g.do({ type: "makeOffer", aa: "meranto", terms: MERANTO_DEAL, fit: { advancesObjective: true, costsProtectedOrHelpsRival: false } });
    g.do({ type: "settleOffer", offer: "o1-meranto", addition: "information" });
    quickTurn(g, { type: "declareAction", action: { act: "a", out: "b", lev: "c" } });
    g.do({ type: "writeAAAction", aa: "caldrath", action: { act: "x", out: "y", lev: "z" } });
    expect(g.state.deals["d1-meranto"]).toMatchObject({ status: "broken", brokenBy: "meranto", brokenTurn: 1 });
    expect(g.decisions()).toEqual([{ kind: "writeAAAction", aa: "meranto", source: "exploit", deal: "d1-meranto" }]);
  });

  it("asks a non-Schemer whether keeping a deal costs it something real", () => {
    // Caldrath is Hostile, so a deal serving its objective rolls at Unlikely: [4,4] -> 4, Yes, but.
    const g = atTalk(4, 4);
    g.do({
      type: "makeOffer",
      aa: "caldrath",
      terms: { text: "x", obligations: { caldrath: [{ kind: "refrain", description: "not cross the passes" }] } },
      fit: { advancesObjective: true, costsProtectedOrHelpsRival: false }
    });
    g.do({ type: "settleOffer", offer: "o1-caldrath", condition: "tolls", takeCondition: true });
    quickTurn(g, { type: "declareAction", action: { act: "a", out: "b", lev: "c" } });
    expect(g.decisions()).toEqual([{ kind: "dealKeepCost", aa: "caldrath", deal: "d1-caldrath" }]);
  });
});

describe("step 5 and 6 branches", () => {
  /** Turn 1, no Offers: Essaveth investigates Caldrath; Caldrath rolls its table. */
  function investigate(dice: number[]) {
    const g = atTalk(...dice);
    quickTurn(g, { type: "declareAction", action: { act: "Send spies", out: "Learn its secret", lev: "Wardens", targets: ["caldrath"], investigates: "caldrath", covert: true } });
    g.do({ type: "writeAAAction", aa: "caldrath", action: { act: "March", out: "Through", lev: "Army" } });
    // Meranto rolls 3, "Buy up [target]'s outstanding paper": Neutral, so the player names the target.
    expect(g.decisions()[0]).toMatchObject({ kind: "targetChoice", aa: "meranto", candidates: ["caldrath", "essaveth"] });
    g.do({ type: "chooseTarget", aa: "meranto", target: "caldrath" });
    g.do({ type: "writeAAAction", aa: "meranto", action: { act: "Buy paper", out: "Leverage", lev: "Money" } });
    expect(g.state.current.actions["a1-meranto"]!.targets).toEqual(["caldrath"]);
    g.do({ type: "advance" });
    g.do({
      type: "classify",
      groups: [
        { class: "opposed", actions: ["a1-essaveth"] },
        { class: "unopposed", actions: ["a1-caldrath"] },
        { class: "unopposed", actions: ["a1-meranto"] }
      ]
    });
    g.do({ type: "grade", action: "a1-essaveth", grade: "weak" });
    return g;
  }

  it("a 4-5 investigation uncovers a private secret for the investigator", () => {
    // Caldrath table 1, Meranto table 3; Essaveth Weak [5,4] -> 4; secret roll 2.
    const g = investigate([1, 3, 5, 4, 2]);
    expect(g.state.aa.caldrath!.secrets).toEqual([{ index: 1, status: "private", knownBy: ["essaveth"], fact: "secret-caldrath-2" }]);
    expect(g.state.facts["secret-caldrath-2"]).toMatchObject({ visibility: { kind: "private", faction: "essaveth" }, status: "established" });
  });

  it("a 2-3 investigation makes it a rumor", () => {
    const g = investigate([1, 3, 3, 6, 5]);
    expect(g.state.aa.caldrath!.secrets[0]).toMatchObject({ index: 4, status: "rumor" });
    expect(g.state.facts["secret-caldrath-5"]!.status).toBe("rumor");
  });

  it("checks whether a covert action is noticed, and who notices costs disposition", () => {
    // ... investigation [3,3] -> 3 (rumor, secret 2), no inspiration; notice Even (it targeted an AA): 5 -> Yes.
    const g = investigate([1, 3, 3, 3, 2]);
    for (const id of ["a1-essaveth", "a1-caldrath", "a1-meranto"]) {
      if (g.decisions().some((d) => d.kind === "forceOfNature" && d.action === id)) g.do({ type: "answerForceOfNature", action: id, use: false });
      g.do({ type: "writeOutcome", action: id, text: "done" });
    }
    g.rng = d6Script(1, 1, 5); // signals Caldrath 1, Meranto 1; notice 5
    g.do({ type: "advance" });
    expect(g.state.current.notice["a1-essaveth"]).toMatchObject({ checked: true, noticed: true, by: "caldrath" });
    expect(g.state.aa.caldrath!.targetsPlayerNext).toBe(true);
    expect(g.log.filter((e) => e.type === "DispositionChanged").at(-1)).toMatchObject({ aa: "caldrath", causes: ["uncovered-covert"] });
    expect(g.log.find((e) => e.type === "OracleConsulted" && e.purpose.kind === "notice")).toMatchObject({ odds: "even" });
  });
});
