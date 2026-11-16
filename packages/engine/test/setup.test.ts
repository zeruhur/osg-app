import { describe, expect, it } from "vitest";
import { fold } from "../src/fold";
import { setupGame } from "../src/setup";
import { appendixBSetup, corentine } from "./helpers";

describe("setupGame: Corentine, lighter, as Essaveth (solo_mode.qmd Appendix A and B)", () => {
  const events = appendixBSetup();
  const s = fold(events);

  it("numbers the log from 0, all at setup, all by the engine", () => {
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
    expect(events.every((e) => e.turn === 0 && e.step === 0 && e.author === "engine")).toBe(true);
    expect(s).toMatchObject({ status: "setup", turn: 0, step: 0, turns: 6, seed: "appendix-b", player: "essaveth" });
  });

  it("makes Essaveth the player, Caldrath and Meranto AAs, Saivorn and the Conclave background", () => {
    const kinds = Object.fromEntries(Object.values(s.factions).map((f) => [f.id, f.kind]));
    expect(kinds).toEqual({ essaveth: "player", caldrath: "aa", meranto: "aa", saivorn: "background", conclave: "background" });
    expect(Object.keys(s.aa).sort()).toEqual(["caldrath", "meranto"]);
  });

  it("copies each AA's brief from the pack", () => {
    for (const id of ["caldrath", "meranto"]) {
      const brief = corentine.factions.find((f) => f.id === id)!.asAA;
      expect(s.aa[id]).toMatchObject({ behavior: brief.behavior, actionTable: brief.actionTable, secretTable: brief.secretTable });
      expect(s.factions[id]!.objectives).toEqual({ shortTerm: brief.objective });
      expect(s.factions[id]!.leverage).toEqual(brief.leverage);
    }
    expect(s.aa.caldrath!.behavior).toBe("aggressor");
    expect(s.aa.meranto!.behavior).toBe("schemer");
  });

  it("gives the player the player brief and its bonus, with every use left", () => {
    const brief = corentine.factions.find((f) => f.id === "essaveth")!.asPlayer;
    expect(s.factions.essaveth!.objectives).toEqual({ shortTerm: brief.shortTerm, longTerm: brief.longTerm });
    expect(s.factions.essaveth!.bonuses).toEqual([{ ...brief.bonus, usesLeft: 2 }]);
  });

  it("gives AAs their bonus and background factions none", () => {
    expect(s.factions.caldrath!.bonuses.map((b) => [b.name, b.usesLeft])).toEqual([["The Old Muster Rolls", 1]]);
    expect(s.factions.meranto!.bonuses.map((b) => [b.name, b.usesLeft])).toEqual([["The Debt Clause", 2]]);
    expect(s.factions.saivorn!.bonuses).toEqual([]);
  });

  it("sets Standing and dispositions as Appendix B's setup line does", () => {
    // [Standing:Board|order:Caldrath, Meranto, Essaveth]; Caldrath disp:Hostile; Meranto disp:Neutral
    expect(s.standing).toEqual(["caldrath", "meranto", "essaveth"]);
    expect(s.aa.caldrath!.disposition).toBe("hostile");
    expect(s.aa.meranto!.disposition).toBe("neutral");
  });

  it("configures the Clock at 0/4 with three escalations, none landed ([Clock:Crisis 0/4])", () => {
    expect(s.clock.length).toBe(4);
    expect(s.clock.position).toBe(0);
    expect(s.clock.escalations.map((e) => [e.box, e.breakingPoint, e.landed])).toEqual([
      [2, false, false],
      [3, false, false],
      [4, true, false]
    ]);
  });

  it("establishes Turn Zero as public facts, tagged with what they name", () => {
    const tz = Object.values(s.facts).filter((f) => f.origin === "turn-zero");
    expect(tz.map((f) => f.text)).toEqual(corentine.turnZero);
    expect(tz.every((f) => f.visibility.kind === "public" && f.status === "established" && f.turn === 0)).toBe(true);
    expect(s.facts["tz-2"]!.tags.factions).toEqual(["essaveth", "caldrath"]);
    expect(s.facts["tz-3"]!.tags).toMatchObject({ factions: ["conclave"], locations: ["corenth"] });
  });

  it("keeps Position facts private to their faction and public lines public", () => {
    expect(s.facts["essaveth-position-1"]).toMatchObject({ visibility: { kind: "private", faction: "essaveth" }, origin: "brief" });
    expect(Object.keys(s.facts).filter((id) => id.startsWith("essaveth-position-"))).toHaveLength(3);
    expect(s.facts["caldrath-position"]!.visibility).toEqual({ kind: "private", faction: "caldrath" });
    expect(s.facts["caldrath-position"]!.tags.factions[0]).toBe("caldrath");
    expect(s.facts["saivorn-public"]!.visibility).toEqual({ kind: "public" });
    expect(s.facts["saivorn-position"]).toBeUndefined();
  });

  it("records the source event of each fact", () => {
    for (const fact of Object.values(s.facts)) expect(events[fact.source]).toMatchObject({ type: "FactEstablished", fact: { id: fact.id } });
  });
});

describe("setupGame: other choices", () => {
  it("plays the full game as Caldrath with four AAs and the Caldrath column of dispositions", () => {
    const s = fold(setupGame(corentine, { variant: "full", player: "caldrath", seed: "x" }));
    expect(Object.keys(s.aa).sort()).toEqual(["conclave", "essaveth", "meranto", "saivorn"]);
    expect(Object.fromEntries(Object.values(s.aa).map((a) => [a.faction, a.disposition]))).toEqual({
      saivorn: "wary",
      conclave: "wary",
      essaveth: "hostile",
      meranto: "neutral"
    });
    expect(s.standing).toEqual(["caldrath", "meranto", "saivorn", "conclave", "essaveth"]);
  });

  it("defaults to the recommended variant and allows another turn count", () => {
    const s = fold(setupGame(corentine, { player: "meranto", seed: "x", turns: 8 }));
    expect(s.scenario.variant).toBe("lighter");
    expect(s.turns).toBe(8);
  });

  it("rejects a background faction as the player, an unknown variant, and a turn count outside 4..8", () => {
    expect(() => setupGame(corentine, { variant: "lighter", player: "saivorn", seed: "x" })).toThrow(/not a playable faction/);
    expect(() => setupGame(corentine, { variant: "huge", player: "essaveth", seed: "x" })).toThrow(/no variant/);
    expect(() => setupGame(corentine, { player: "essaveth", seed: "x", turns: 3 })).toThrow(/turns must be 4 to 8/);
  });

  it("is deterministic", () => {
    expect(appendixBSetup()).toEqual(appendixBSetup());
  });
});
