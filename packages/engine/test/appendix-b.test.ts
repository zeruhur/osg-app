import { d6Script } from "@osg/dice/testing";
import { describe, expect, it } from "vitest";
import type { EventOf, EventType, GameEvent } from "../src/events";
import { applyEvent, fold } from "../src/fold";
import type { GameState } from "../src/types";
import { APPENDIX_B_DICE, playAppendixBTurn1 } from "./appendix-b";

// solo_mode.qmd Appendix B, "A Worked Turn", checked line by line against the engine's log and state.
const game = playAppendixBTurn1();
const { log, state } = game;
const all = <T extends EventType>(type: T) => log.filter((e): e is EventOf<T> => e.type === type);
const one = <T extends EventType>(type: T, match: (e: EventOf<T>) => boolean = () => true) => {
  const found = all(type).filter(match);
  expect(found, `${type}`).toHaveLength(1);
  return found[0]!;
};

describe("Appendix B, Turn 1: the log", () => {
  it("2. Talk: Likely, [2,4] -> Yes, but...; Essaveth takes the condition; the deal is struck", () => {
    expect(one("OfferMade")).toMatchObject({ aa: "meranto", odds: "likely", steps: ["Start at Even", "Better: advances its objective"] });
    expect(one("OracleConsulted", (e) => e.purpose.kind === "offer")).toMatchObject({ odds: "likely", roll: { faces: [2, 4] }, kept: 4, answer: "yes-but" });
    expect(one("OfferSettled")).toMatchObject({ deal: true, condition: "Essaveth's toll revenue must clear through Meranto houses for the duration" });
    expect(one("DealStruck").deal).toMatchObject({ id: "d1-meranto", parties: ["essaveth", "meranto"] });
  });

  it("3. Declare: Essaveth's action is written and fixed before either AA acts", () => {
    const declared = one("ActionDeclared");
    expect(declared.action).toMatchObject({ faction: "essaveth", bonus: "The Pass Wardens", source: "player" });
    const firstAA = log.findIndex((e) => e.type === "AATableRolled" || e.type === "OracleConsulted" && e.purpose.kind === "deal-keep");
    expect(declared.seq).toBeLessThan(firstAA);
  });

  it("4. Caldrath rolls 3 and targets Essaveth (Hostile); Meranto keeps the deal (Likely [5,3]) and acts on it", () => {
    expect(one("AATableRolled")).toMatchObject({ aa: "caldrath", index: 2, entry: "Demand right of passage from [target], backed by the army" });
    expect(one("TargetFilled")).toMatchObject({ aa: "caldrath", target: "essaveth", reason: "hostile: picks you" });
    expect(one("OracleConsulted", (e) => e.purpose.kind === "deal-keep")).toMatchObject({ odds: "likely", roll: { faces: [5, 3] }, answer: "yes" });
    const kept = one("DealKept");
    expect(kept).toMatchObject({ deal: "d1-meranto", by: "meranto" });
    expect(kept.seq).toBeLessThan(one("ActionAccepted", (a) => a.action.faction === "meranto").seq);
    expect(all("AATableRolled").some((e) => e.aa === "meranto")).toBe(false);
    expect(state.current.actions["a1-meranto"]!.source).toBe("obligation");
  });

  it("5. Essaveth: Strong + Pass Wardens, [3,5] -> 5 counts as a 6", () => {
    expect(one("DiceRolled", (e) => e.action === "a1-essaveth")).toMatchObject({
      grade: "strong",
      keep: "high",
      roll: { faces: [3, 5] },
      kept: 5,
      effective: 6,
      bonusEffect: "4-5-to-6",
      doubles: false
    });
    expect(one("BonusSpent")).toMatchObject({ faction: "essaveth", bonus: "The Pass Wardens" });
  });

  it("5. Caldrath: Strong, [4,4] -> 4, doubles; no Force of Nature fits, declined", () => {
    expect(one("DiceRolled", (e) => e.action === "a1-caldrath")).toMatchObject({ grade: "strong", kept: 4, effective: 4, doubles: true });
    expect(one("ForceOfNatureAnswered")).toMatchObject({ action: "a1-caldrath", use: false });
    expect(state.forceOfNatureUsed).toBe(0);
  });

  it("5. Conflict: Essaveth 6 vs Caldrath 4 -> Essaveth prevails; Caldrath worse than desired", () => {
    expect(one("ResultBanded", (e) => e.action === "a1-essaveth")).toMatchObject({ band: "especially-good", outcome: "prevails" });
    expect(one("ResultBanded", (e) => e.action === "a1-caldrath")).toMatchObject({ band: "worse", outcome: "worse" });
  });

  it("5. Especially Good d6=4 -> Weakens a rival (Caldrath)", () => {
    expect(one("InspirationRolled")).toMatchObject({ action: "a1-essaveth", table: "especiallyGood", face: 4, effect: "rival-down" });
    expect(one("InspirationApplied")).toMatchObject({ effect: "rival-down", target: "caldrath" });
  });

  it("5. Meranto: unopposed -> success, no roll", () => {
    expect(one("ResultBanded", (e) => e.action === "a1-meranto")).toMatchObject({ band: "success", outcome: "unopposed" });
    expect(all("DiceRolled").some((e) => e.action === "a1-meranto")).toBe(false);
  });

  it("6. Signals: Caldrath 3 -> Warning; Meranto 5 -> Exposure. No covert action, no notice check", () => {
    expect(all("SignalRolled").map((e) => [e.aa, e.face, e.signal])).toEqual([
      ["caldrath", 3, "warning"],
      ["meranto", 5, "exposure"]
    ]);
    expect(all("OracleConsulted").some((e) => e.purpose.kind === "notice")).toBe(false);
  });

  it("7. [Rival:Meranto|disp:Neutral>Open]; Caldrath harmed but already Hostile", () => {
    expect(one("DispositionChanged", (e) => e.aa === "meranto")).toMatchObject({ from: "neutral", to: "open", causes: ["kept-deal-or-benefited"] });
    expect(one("DispositionChanged", (e) => e.aa === "caldrath")).toMatchObject({ from: "hostile", to: "hostile", causes: ["harmed"] });
  });

  it("7. [Clock:Crisis+1]; no AA rolled a 6 or a 1, so no table changes", () => {
    expect(one("ClockMoved")).toMatchObject({ delta: 1, reason: "turn", position: 1 });
    expect(all("EscalationLanded")).toEqual([]);
    expect(all("TableEntryRewritten")).toEqual([]);
    expect(state.current.adaptation).toEqual({});
  });

  it("7-8. Standing set from the proposal; two threads opened with the Report", () => {
    expect(one("StandingSet", (e) => e.turn === 1).order).toEqual(["meranto", "caldrath", "essaveth"]);
    expect(Object.values(state.threads).map((t) => [t.text, t.opened])).toEqual([
      ["The herald's warning", 1],
      ["Meranto's couriers in the passes", 1]
    ]);
    expect(state.reports[1]!.closing).toBe("A shut gate has stopped an army once. Everyone is now asking how long it can do it again.");
  });
});

describe("Appendix B, Turn 1: the state after TurnClosed", () => {
  it("[Standing:Board|order:Meranto, Caldrath, Essaveth]", () => {
    expect(state.standing).toEqual(["meranto", "caldrath", "essaveth"]);
  });

  it("Meranto Open, Caldrath Hostile", () => {
    expect(state.aa.meranto!.disposition).toBe("open");
    expect(state.aa.caldrath!.disposition).toBe("hostile");
  });

  it("[Deal:Essaveth/Meranto|...|status:active|since Turn 1]", () => {
    expect(state.deals["d1-meranto"]).toMatchObject({ parties: ["essaveth", "meranto"], status: "active", since: 1 });
    expect(state.deals["d1-meranto"]!.terms).toContain("toll revenue must clear through Meranto houses");
  });

  it("[Clock:Crisis 1/4], the first Escalation (box 2, Blood at the passes) still ahead", () => {
    expect(state.clock.position).toBe(1);
    expect(state.clock.escalations.map((e) => e.landed)).toEqual([false, false, false]);
  });

  it("[Bon:Essaveth|Pass Wardens-1]: one use left", () => {
    expect(state.factions.essaveth!.bonuses).toEqual([expect.objectContaining({ name: "The Pass Wardens", uses: 2, usesLeft: 1 })]);
    expect(state.factions.caldrath!.bonuses[0]!.usesLeft).toBe(1);
  });

  it("remembers who acted on whom, for next turn's Reactor and targeting rules", () => {
    expect(state.aa.caldrath).toMatchObject({ actedUponLastTurn: true, lastAffectedBy: "meranto" });
    expect(state.aa.meranto!.actedUponLastTurn).toBe(false);
  });

  it("consumed exactly the book's dice", () => {
    const rng = d6Script(...APPENDIX_B_DICE);
    playAppendixBTurn1(rng);
    expect(rng.remaining).toBe(0);
    expect(state.rngPosition).toBe(APPENDIX_B_DICE.length);
  });
});

describe("replay", () => {
  // JSON round trip: what a campaign file would store and load.
  const stored: GameEvent[] = JSON.parse(JSON.stringify(log));

  it("folding the stored log alone gives the state the commands built", () => {
    expect(fold(stored)).toEqual(state);
  });

  it("folding event by event matches folding the whole log at every point", () => {
    let s: GameState | undefined;
    for (let i = 0; i < stored.length; i++) {
      s = applyEvent(s, stored[i]!);
      if (i % 10 === 0 || i === stored.length - 1) expect(s).toEqual(fold(stored.slice(0, i + 1)));
    }
  });

  it("playing the same commands with the same dice gives the same log", () => {
    expect(playAppendixBTurn1().log).toEqual(log);
  });

  it("every roll in the log is reproducible from its recorded faces and position", () => {
    let position = 0;
    for (const e of stored) {
      if (!("roll" in e) || !e.roll) continue;
      expect(e.roll.position).toBe(position);
      position += e.roll.faces.length;
    }
    expect(position).toBe(APPENDIX_B_DICE.length);
  });
});
