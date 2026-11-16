import { describe, expect, it } from "vitest";
import type { DispositionId } from "../types";
import { offerFollowUp, offerOdds, signalOfferRefusalDelta } from "./offers";

const fit = (advancesObjective: boolean, costsProtectedOrHelpsRival: boolean) => ({ advancesObjective, costsProtectedOrHelpsRival });

describe("Offer odds (solo_mode.qmd Part V, Making an Offer)", () => {
  it("Appendix B: Meranto, Neutral, the deal advances its objective -> Likely", () => {
    expect(offerOdds("neutral", fit(true, false)).odds).toBe("likely");
  });

  it("starts at Even and shifts one step per reason", () => {
    expect(offerOdds("neutral", fit(false, false)).odds).toBe("even");
    expect(offerOdds("neutral", fit(false, true)).odds).toBe("unlikely");
    expect(offerOdds("open", fit(false, false)).odds).toBe("likely");
    expect(offerOdds("wary", fit(false, false)).odds).toBe("unlikely");
    expect(offerOdds("wary", fit(true, false)).odds).toBe("even");
  });

  it("accepts without rolling past Likely and refuses past Unlikely", () => {
    expect(offerOdds("open", fit(true, false)).odds).toBe("accepted");
    expect(offerOdds("wary", fit(false, true)).odds).toBe("refused");
  });

  it("Hostile refuses unless the deal serves its objective; then Unlikely, whatever else applies (A3)", () => {
    expect(offerOdds("hostile", fit(false, false)).odds).toBe("refused");
    expect(offerOdds("hostile", fit(true, false)).odds).toBe("unlikely");
    expect(offerOdds("hostile", fit(true, true)).odds).toBe("unlikely");
  });

  it("Allied accepts without rolling if the deal serves its objective, otherwise one step better", () => {
    expect(offerOdds("allied", fit(true, true)).odds).toBe("accepted");
    expect(offerOdds("allied", fit(false, false)).odds).toBe("likely");
    expect(offerOdds("allied", fit(false, true)).odds).toBe("even");
  });

  it("explains every step", () => {
    expect(offerOdds("neutral", fit(true, false)).steps).toEqual(["Start at Even", "Better: advances its objective"]);
  });

  it("never gets better as the disposition worsens (property over the whole table)", () => {
    const ladder = ["refused", "unlikely", "even", "likely", "accepted"];
    const scale: DispositionId[] = ["hostile", "wary", "neutral", "open", "allied"];
    for (const a of [true, false])
      for (const c of [true, false]) {
        const ranks = scale.map((d) => ladder.indexOf(offerOdds(d, fit(a, c)).odds));
        expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
      }
  });
});

describe("Offer results", () => {
  it("maps each answer to its follow-up", () => {
    expect(["yes-and", "yes", "yes-but", "no-but", "no", "no-and"].map((a) => offerFollowUp(a as never))).toEqual([
      "accept-and-add",
      "accept",
      "accept-on-condition",
      "refuse-with-counter",
      "refuse",
      "refuse-and-offend-or-leak"
    ]);
  });

  it("charges -1 for refusing a Signal Offer from an Open or Allied AA only (Part V, Signals)", () => {
    expect(["hostile", "wary", "neutral", "open", "allied"].map((d) => signalOfferRefusalDelta(d as DispositionId))).toEqual([0, 0, 0, -1, -1]);
  });
});
