import type { Rng } from "@osg/dice";
import type { ActionInput, ActionState, Command, Decision, DealTerms, FactionId, GameState } from "@osg/engine";

/** Knobs for the default policy. Probabilities are 0..1. */
export interface PolicyOptions {
  /** Chance of grading any action Strong. */
  strong: number;
  /** Chance of making an Offer to each AA at step 2. */
  offer: number;
  /** Chance a declared action is covert, and that it investigates its target. */
  covert: number;
  investigate: number;
  /** Chance the player spends a bonus when one is left. */
  bonus: number;
  /** Use "something especially good/bad" when a 6 or a 1 calls for it. */
  inspiration: boolean;
  /** Use a Force of Nature on doubles when one is available. */
  forceOfNature: boolean;
}

export const DEFAULT_POLICY: PolicyOptions = {
  strong: 0.5,
  offer: 0.5,
  covert: 0.2,
  investigate: 0.2,
  bonus: 0.3,
  inspiration: true,
  forceOfNature: false
};

const chance = (rng: Rng, p: number) => rng.next() < p;
const pick = <T>(rng: Rng, xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(rng.next() * xs.length)] : undefined);
const aas = (s: GameState) => s.scenario.aas.map((a) => a.faction).filter((id) => s.aa[id]);

/** Optional moves the policy makes before advancing a finished step (only Offers, at step 2). */
export function optionalMoves(s: GameState, rng: Rng, o: PolicyOptions): Command[] {
  if (s.step !== 2) return [];
  const offered = new Set(Object.values(s.current.offers).map((x) => x.aa));
  const moves: Command[] = [];
  for (const aa of aas(s)) {
    if (offered.has(aa) || !chance(rng, o.offer)) continue;
    const terms: DealTerms = {
      text: `Turn ${s.turn}: ${s.player} and ${aa} agree terms`,
      obligations: {
        [s.player]: [{ kind: "refrain", description: `not act against ${aa}` }],
        [aa]: chance(rng, 0.5) ? [{ kind: "act", description: `help ${s.player} this turn`, turn: s.turn }] : [{ kind: "refrain", description: `not act against ${s.player}` }]
      },
      until: s.turn + 1
    };
    moves.push({ type: "makeOffer", aa, terms, fit: { advancesObjective: chance(rng, 0.5), costsProtectedOrHelpsRival: chance(rng, 0.3) } });
  }
  return moves;
}

/** The default policy's answer to a decision point. Deterministic for a given Rng. */
export function answer(s: GameState, d: Decision, rng: Rng, o: PolicyOptions): Command {
  switch (d.kind) {
    case "startGame":
      return { type: "startGame" };
    case "openTurn":
      return { type: "openTurn" };

    case "settleOffer":
      switch (d.followUp) {
        case "accept-and-add":
          return { type: "settleOffer", offer: d.offer, addition: pick(rng, ["information", "help", "disposition"] as const)! };
        case "accept-on-condition":
          return { type: "settleOffer", offer: d.offer, condition: "an added condition", takeCondition: chance(rng, 0.5) };
        case "refuse-with-counter":
          return { type: "settleOffer", offer: d.offer, counter: "a counter-proposal" };
        case "refuse-and-offend-or-leak":
          return { type: "settleOffer", offer: d.offer, consequence: chance(rng, 0.5) ? "offense" : "leak" };
      }
      break;

    case "signalOffer":
      return chance(rng, 0.5)
        ? {
            type: "answerSignalOffer",
            aa: d.aa,
            accept: true,
            terms: { text: `${d.aa}'s proposal`, obligations: { [d.aa]: [{ kind: "refrain", description: `not act against ${s.player}` }] }, until: s.turn + 1 }
          }
        : { type: "answerSignalOffer", aa: d.aa, accept: false };

    case "declare": {
      const target = pick(rng, aas(s));
      const bonus = s.factions[s.player]!.bonuses.find((b) => b.usesLeft > 0);
      const action: ActionInput & { bonus?: string } = {
        act: `${s.player} acts against ${target ?? "the crisis"}`,
        out: "It works",
        lev: "Its position",
        ...(target ? { targets: [target] } : {}),
        ...(target && chance(rng, o.investigate) ? { investigates: target } : {}),
        covert: chance(rng, o.covert),
        ...(bonus && chance(rng, o.bonus) ? { bonus: bonus.name } : {})
      };
      return { type: "declareAction", action };
    }

    case "dealKeepCost":
      return { type: "answerDealCost", aa: d.aa, deal: d.deal, costs: chance(rng, 0.3) };
    case "consolidatorThreat":
      return { type: "answerThreat", aa: d.aa, threatened: chance(rng, 0.5) };
    case "targetChoice": {
      const target = d.prefer ?? pick(rng, d.candidates.filter((c) => c !== d.avoid)) ?? pick(rng, d.candidates)!;
      return { type: "chooseTarget", aa: d.aa, target };
    }
    case "writeAAAction": {
      const target = d.target ?? (d.source === "exploit" ? s.player : undefined);
      return {
        type: "writeAAAction",
        aa: d.aa,
        action: { act: d.entry ?? d.obligation?.description ?? `${d.aa} acts`, out: "It works", lev: "Its position", ...(target ? { targets: [target] } : {}) }
      };
    }

    case "classify":
      return { type: "classify", groups: classify(s, d.actions) };
    case "bothCanBeTrue":
      return { type: "judgeConflict", group: d.group, bothCanBeTrue: false };
    case "grade":
      return {
        type: "grade",
        action: d.action,
        grade: chance(rng, o.strong) ? "strong" : "weak",
        ...(d.askBonusScope ? { bonusInScope: chance(rng, 0.5) } : {})
      };
    case "forceOfNature":
      return { type: "answerForceOfNature", action: d.action, use: o.forceOfNature };
    case "inspiration":
      return { type: "answerInspiration", action: d.action, use: o.inspiration };
    case "inspirationTarget": {
      const target = pick(rng, d.candidates);
      return { type: "chooseInspirationTarget", action: d.action, ...(target ? { target } : {}) };
    }
    case "clockEffect":
      return { type: "answerClockEffect", action: d.action, question: d.question, yes: false };
    case "investigationSix":
      return { type: "answerInvestigationSix", action: d.action, keep: "both" };
    case "revealToAA": {
      const fact = Object.values(s.facts).find((f) => f.visibility.kind === "private" && f.visibility.faction === s.player)!;
      return { type: "revealToAA", action: d.action, fact: fact.id };
    }
    case "writeOutcome":
      return { type: "writeOutcome", action: d.action, text: `Outcome of ${d.action}` };

    case "exposure":
      return { type: "answerExposure", aa: d.aa, rollSecret: chance(rng, 0.3) };
    case "interested":
      return { type: "answerInterested", action: d.action, aas: aas(s) };

    case "dispositionCauses": {
      const keptDeal = Object.values(s.deals).some((x) => x.status === "active" && x.parties.includes(d.aa));
      const harmed = s.current.order.some((id) => {
        const a = s.current.actions[id]!;
        return a.faction === s.player && a.targets.includes(d.aa) && ["success", "especially-good"].includes(s.current.adjudication[id]?.band ?? "");
      });
      return { type: "answerDisposition", aa: d.aa, keptDealOrBenefited: keptDeal, harmed };
    }
    case "adaptation":
      return { type: "rewriteEntry", aa: d.aa, index: Math.floor(rng.next() * 6), text: `Adapted entry, turn ${s.turn}`, trigger: d.trigger };
    case "standing":
      return { type: "setStanding", order: d.proposal };
    case "report":
      return { type: "publishReport", report: { header: `Turn ${s.turn}.`, paragraphs: [], crumbs: [], closing: "The crisis goes on." } };
  }
  throw new Error(`no policy for ${(d as Decision).kind}`);
}

/** Pairs actions aimed at each other's actors into conflicts; an action with a target is opposed;
 * holds and untargeted actions are unopposed. */
export function classify(s: GameState, ids: readonly string[]): { class: "unopposed" | "opposed" | "conflict"; actions: string[] }[] {
  const actions = ids.map((id) => s.current.actions[id]!);
  const hits = (a: ActionState, b: ActionState) => a.targets.some((t: FactionId) => b.participants.includes(t));
  const used = new Set<string>();
  const groups: { class: "unopposed" | "opposed" | "conflict"; actions: string[] }[] = [];
  for (const a of actions) {
    if (used.has(a.id)) continue;
    used.add(a.id);
    if (a.source === "hold") {
      groups.push({ class: "unopposed", actions: [a.id] });
      continue;
    }
    const rival = actions.find((b) => !used.has(b.id) && b.source !== "hold" && (hits(a, b) || hits(b, a)));
    if (rival) {
      used.add(rival.id);
      groups.push({ class: "conflict", actions: [a.id, rival.id] });
    } else groups.push({ class: a.targets.length ? "opposed" : "unopposed", actions: [a.id] });
  }
  return groups;
}
