import { d6Script } from "@osg/dice/testing";
import type { DealTerms } from "../src/types";
import { Game, appendixBSetup } from "./helpers";

// solo_mode.qmd Appendix B, "A Worked Turn" (upstream 0d96334): the lighter Corentine game, playing
// Essaveth, Turn 1. Every die below is the book's, in the order the engine rolls them.
export const APPENDIX_B_DICE = [
  2, 4, // Offer to Meranto, Likely: 2d6kh1[2,4]=4 -> Yes, but...
  3, // Caldrath Action d6=3 -> Demand right of passage
  5, 3, // Does Meranto keep the deal? (Likely) 2d6kh1[5,3]=5 -> Yes
  3, 5, // Essaveth, Strong + Pass Wardens: 2d6kh1[3,5]=5 -> 6
  4, 4, // Caldrath, Strong: 2d6kh1[4,4]=4 (doubles)
  4, // Especially Good d6=4 -> Weakens a rival
  3, // Caldrath Signal d6=3 -> Warning
  5 // Meranto Signal d6=5 -> Exposure
];

export const MERANTO_DEAL: DealTerms = {
  text: "Essaveth opens its passes to Meranto's agents and couriers; Meranto delays Caldrath's next war-loan payment by a month",
  obligations: {
    essaveth: [{ kind: "refrain", description: "Keep the passes open to Meranto's agents and couriers" }],
    meranto: [{ kind: "act", description: "Delay Caldrath's next war-loan payment by a month", turn: 1 }]
  }
};

/** Plays Appendix B's Turn 1 through commands. Returns the game at the end of the turn. */
export function playAppendixBTurn1(rng = d6Script(...APPENDIX_B_DICE)): Game {
  const g = new Game(appendixBSetup(), rng);
  g.do({ type: "startGame" });
  g.do({ type: "openTurn" });

  // 1. Take stock
  g.do({ type: "advance" });

  // 2. Talk
  g.do({ type: "makeOffer", aa: "meranto", terms: MERANTO_DEAL, fit: { advancesObjective: true, costsProtectedOrHelpsRival: false } });
  g.do({
    type: "settleOffer",
    offer: "o1-meranto",
    condition: "Essaveth's toll revenue must clear through Meranto houses for the duration",
    takeCondition: true
  });
  g.do({ type: "advance" });

  // 3. Declare
  g.do({
    type: "declareAction",
    action: {
      act: "Close the northern passes to all armed movement and post the Pass Wardens at every gate",
      out: "Caldrath's army cannot cross this turn without fighting its way through",
      lev: "The passes are ours (Position); the garrison can hold for weeks; the Wardens know every ledge and sally port",
      bonus: "The Pass Wardens",
      targets: ["caldrath"],
      citedFacts: ["essaveth-position-1", "essaveth-position-3"]
    }
  });
  g.do({ type: "advance" });

  // 4. AA actions: Caldrath rolls its table (target filled: Hostile); Meranto keeps the deal and acts on it.
  g.do({
    type: "writeAAAction",
    aa: "caldrath",
    action: {
      act: "Send a herald to the gate towers demanding right of passage for the army, with the army drawn up in sight of the walls",
      out: "Essaveth opens the passes; the army is through by the turn's end",
      lev: "The largest army on the peninsula, a day from the gates; Essaveth's garrison is small and everyone knows it",
      citedFacts: ["caldrath-position"]
    }
  });
  g.do({
    type: "writeAAAction",
    aa: "meranto",
    action: {
      act: "Inform Caldrath's treasury that the next war-loan payment is deferred pending a review of the House's exposure",
      out: "Caldrath's campaign chest runs a month short",
      lev: "Meranto holds the loan and its terms",
      targets: ["caldrath"]
    }
  });
  g.do({ type: "advance" });

  // 5. Adjudicate
  g.do({
    type: "classify",
    groups: [
      { class: "conflict", actions: ["a1-essaveth", "a1-caldrath"] },
      { class: "unopposed", actions: ["a1-meranto"] }
    ]
  });
  g.do({ type: "judgeConflict", group: "g1", bothCanBeTrue: false });
  g.do({ type: "grade", action: "a1-essaveth", grade: "strong" });
  g.do({ type: "grade", action: "a1-caldrath", grade: "strong", bonusInScope: false });
  g.do({ type: "answerInspiration", action: "a1-essaveth", use: true });
  g.do({ type: "answerClockEffect", action: "a1-essaveth", question: "addresses", yes: false });
  g.do({ type: "answerForceOfNature", action: "a1-caldrath", use: false });
  g.do({
    type: "writeOutcome",
    action: "a1-essaveth",
    text: "The gates stay shut; the herald is turned away at the first tower. The army stood in sight of the walls and did nothing; every court on the peninsula hears of it by week's end.",
    facts: [{ text: "Essaveth's gates turned away Caldrath's herald", visibility: { kind: "public" }, tags: { factions: ["essaveth", "caldrath"] } }]
  });
  g.do({ type: "writeOutcome", action: "a1-caldrath", text: "The army does not cross." });
  g.do({
    type: "writeOutcome",
    action: "a1-meranto",
    text: "Caldrath's treasury receives the deferral notice; Caldrath's chancellor knows who is squeezing the war chest.",
    facts: [{ text: "Merchants report unfamiliar couriers using the gate towers' stables, paid in Meranto silver", visibility: { kind: "public" } }]
  });
  g.do({ type: "advance" });

  // 6. Signals and notice: Caldrath Warning, Meranto Exposure (named, not a secret).
  g.do({ type: "answerExposure", aa: "meranto", rollSecret: false });
  g.do({ type: "advance" });

  // 7. Update
  g.do({ type: "answerDisposition", aa: "caldrath", keptDealOrBenefited: false, harmed: true });
  g.do({ type: "answerDisposition", aa: "meranto", keptDealOrBenefited: true, harmed: false });
  g.do({ type: "setStanding", order: ["meranto", "caldrath", "essaveth"] });
  g.do({ type: "advance" });

  // 8. The Report
  g.do({
    type: "publishReport",
    report: {
      header: "Twelve days after the Arbiter's death, the peninsula waits on the northern passes.",
      paragraphs: [
        "Essaveth closed its gates to armed movement on the 13th. A Caldrath herald demanding passage was turned away at the first tower while the army stood drawn up below the walls.",
        "Caldrath's treasury has received notice from House Meranto deferring the next payment on its war loans."
      ],
      crumbs: ["Merchants report unfamiliar couriers using the gate towers' stables, paid in Meranto silver."],
      closing: "A shut gate has stopped an army once. Everyone is now asking how long it can do it again."
    },
    threads: [
      { text: "The herald's warning", facts: [] },
      { text: "Meranto's couriers in the passes", facts: [] }
    ]
  });
  return g;
}
