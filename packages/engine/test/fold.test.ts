import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EngineError } from "../src/errors";
import type { EventBody, GameEvent } from "../src/events";
import { applyEvent, fold } from "../src/fold";
import { append, appendixBSetup, deepFreeze, emptyTurn } from "./helpers";

const setup = appendixBSetup();
const started = append(setup, [{ type: "GameStarted" }]);

const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return e instanceof EngineError ? e.code : `not an EngineError: ${String(e)}`;
  }
  return "no error";
};

describe("fold", () => {
  it("rejects an empty log and a log that doesn't start with GameCreated", () => {
    expect(code(() => fold([]))).toBe("no-game");
    expect(code(() => fold(setup.slice(1).map((e, i) => ({ ...e, seq: i }))))).toBe("no-game");
  });

  it("rejects a gap, a repeat or a reordering in seq", () => {
    expect(code(() => fold([setup[0]!, { ...setup[1]!, seq: 2 }]))).toBe("bad-sequence");
    expect(code(() => fold([setup[0]!, setup[1]!, setup[1]!]))).toBe("bad-sequence");
  });

  it("folds every prefix of a valid log", () => {
    const log = append(started, [...emptyTurn(1), ...emptyTurn(2)]);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: log.length }), (n) => {
        expect(fold(log.slice(0, n)).nextSeq).toBe(n);
      })
    );
  });

  it("never mutates the events or the previous state", () => {
    const log = deepFreeze(append(started, emptyTurn(1)));
    const before = deepFreeze(fold(log.slice(0, -1)));
    const snapshot = structuredClone(before);
    const after = applyEvent(before, log[log.length - 1]!);
    expect(before).toEqual(snapshot);
    expect(after).not.toBe(before);
  });

  it("rejects a second GameCreated", () => {
    expect(code(() => append(setup, [setup[0]!]))).toBe("invalid");
  });
});

describe("setup events", () => {
  it("rejects a Standing that leaves out or adds a faction", () => {
    expect(code(() => append(setup, [{ type: "StandingSet", order: ["caldrath", "meranto"] }]))).toBe("invalid");
    expect(code(() => append(setup, [{ type: "StandingSet", order: ["caldrath", "meranto", "essaveth", "saivorn"] }]))).toBe(
      "invalid"
    );
  });

  it("rejects a disposition for a faction that isn't an AA", () => {
    expect(code(() => append(setup, [{ type: "DispositionSet", aa: "saivorn", disposition: "open" }]))).toBe("invalid");
    expect(code(() => append(setup, [{ type: "DispositionSet", aa: "essaveth", disposition: "open" }]))).toBe("invalid");
  });

  it("rejects a clock without a Breaking Point on its last box", () => {
    const body: EventBody = { type: "ClockConfigured", length: 5, escalations: [{ box: 4, title: "x", text: "x", breakingPoint: true }] };
    expect(code(() => append(setup, [body]))).toBe("invalid");
  });

  it("rejects duplicate facts, unknown factions and unknown threads", () => {
    const fact = (id: string, faction: string, threads: string[] = []): EventBody => ({
      type: "FactEstablished",
      fact: { id, text: "x", visibility: { kind: "public" }, tags: { factions: [faction], locations: [], threads }, status: "established", origin: "play" }
    });
    expect(code(() => append(setup, [fact("tz-1", "caldrath")]))).toBe("invalid");
    expect(code(() => append(setup, [fact("new", "atlantis")]))).toBe("invalid");
    expect(code(() => append(setup, [fact("new", "caldrath", ["t-1"])]))).toBe("invalid");
  });

  it("opens and closes threads", () => {
    const log = append(setup, [
      { type: "ThreadOpened", thread: { id: "t-1", text: "Who paid the physician?", facts: ["tz-1"] } },
      { type: "ThreadClosed", thread: "t-1" }
    ]);
    expect(fold(log).threads["t-1"]).toEqual({ id: "t-1", text: "Who paid the physician?", facts: ["tz-1"], opened: 0, closed: 0 });
    expect(code(() => append(log, [{ type: "ThreadClosed", thread: "t-1" }]))).toBe("invalid");
  });
});

describe("turn lifecycle", () => {
  it("starts only from a complete setup", () => {
    expect(fold(started).status).toBe("playing");
    expect(code(() => append(setup.slice(0, 1), [{ type: "GameStarted" }]))).toBe("invalid");
    expect(code(() => append(started, [{ type: "GameStarted" }]))).toBe("out-of-order");
  });

  it("does not open a turn before the game starts", () => {
    expect(code(() => append(setup, [{ type: "TurnOpened", opens: 1 }]))).toBe("out-of-order");
  });

  it("walks steps 1 to 8 in order, then closes the turn", () => {
    const log = append(started, emptyTurn(1));
    const steps = log.slice(started.length).map((e) => fold(log.slice(0, e.seq + 1)).step);
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8]);
    expect(fold(log)).toMatchObject({ turn: 1, step: 8, turnOpen: false });
  });

  it("stamps events with the turn and step they happen in", () => {
    const log = append(started, emptyTurn(1));
    expect(log.slice(started.length).map((e) => [e.turn, e.step])).toEqual([
      [0, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [1, 5],
      [1, 6],
      [1, 7],
      [1, 8]
    ]);
  });

  it("rejects skipping a step, closing before the Report, and opening a turn twice", () => {
    const opened = append(started, [{ type: "TurnOpened", opens: 1 }]);
    expect(code(() => append(opened, [{ type: "StepAdvanced", to: 3 }]))).toBe("out-of-order");
    expect(code(() => append(opened, [{ type: "TurnClosed" }]))).toBe("out-of-order");
    expect(code(() => append(opened, [{ type: "TurnOpened", opens: 2 }]))).toBe("out-of-order");
    expect(code(() => append(started, [{ type: "TurnOpened", opens: 2 }]))).toBe("out-of-order");
  });

  it("ends after the last turn and never extends it (solo_mode.qmd Part IX)", () => {
    let log: GameEvent[] = started;
    for (let t = 1; t <= 6; t++) log = append(log, emptyTurn(t));
    expect(code(() => append(log, [{ type: "TurnOpened", opens: 7 }]))).toBe("out-of-order");
    const ended = append(log, [{ type: "GameEnded" }]);
    expect(fold(ended).status).toBe("ended");
    expect(code(() => append(append(started, emptyTurn(1)), [{ type: "GameEnded" }]))).toBe("out-of-order");
  });
});
