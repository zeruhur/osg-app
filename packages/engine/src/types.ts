import type { AnswerId, BandId, BehaviorId, DispositionId, OracleOddsId } from "@osg/rules-data";

export type { BehaviorId, DispositionId };

/** Leverage grade (contested_ground.qmd Part IV, The Core Assessment). */
export type Grade = "strong" | "weak";
/** Oracle odds that roll (solo_mode.qmd Part III, Asking). */
export type OracleOdds = OracleOddsId;
/** The full Offer ladder: the ends don't roll (solo_mode.qmd Part V, Making an Offer). */
export type OfferOdds = "refused" | OracleOdds | "accepted";
/** An Oracle answer, "yes-and" (6) to "no-and" (1). */
export type Answer = AnswerId;
/** Result band: 6 especially good, 4-5 success, 2-3 worse than desired, 1 especially bad. */
export type Band = BandId;

export type FactionId = string;
export type FactId = string;
export type ThreadId = string;
export type LocationId = string;

/** 0 is setup (before Turn 1); 1..8 are the Solo Mode turn steps (solo_mode.qmd Part X). */
export type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Author = "player" | "engine" | `llm:${string}`;

/** Stamped on every event. `seq` numbers the log from 0 with no gaps. */
export interface EventMeta {
  seq: number;
  turn: number;
  step: Step;
  author: Author;
}

/** Stamped on every event that rolls: enough to reproduce the roll with `createRng(seed, position)`. */
export interface RollMeta {
  seed: string;
  /** Rng position before the roll. */
  position: number;
  faces: number[];
}

// ---------- scenario ----------

export interface Location {
  id: LocationId;
  name: string;
  notes: string;
  contested: boolean;
}

export interface Leverage {
  primary: string;
  secondary?: string | undefined;
}

export interface BonusState {
  name: string;
  uses: number;
  usesLeft: number;
  text?: string | undefined;
}

export type FactionKind = "player" | "aa" | "background";

/** A faction as this game uses it. Background factions exist in the world but take no actions
 * and have no disposition (solo_mode.qmd Appendix A, lighter game). */
export interface FactionSnapshot {
  id: FactionId;
  name: string;
  kind: FactionKind;
  public: string;
  /** The player's two objectives, or the AA's single objective as `shortTerm`. */
  objectives: { shortTerm: string; longTerm?: string | undefined };
  leverage: Leverage;
  bonuses: { name: string; uses: number; text?: string | undefined }[];
}

/** solo_mode.qmd Part IV, The AA Brief. */
export interface AASnapshot {
  faction: FactionId;
  behavior: BehaviorId;
  actionTable: string[];
  secretTable: string[];
}

export interface Escalation {
  box: number;
  title: string;
  text: string;
  breakingPoint: boolean;
}

/** What `GameCreated` carries: the scenario resolved for this game (variant, player faction), so
 * a stored game replays the same even if the pack it came from changes later. */
export interface ScenarioSnapshot {
  packId: string;
  title: string;
  variant: string;
  problem: string;
  world: string;
  map: Location[];
  unsettled: string[];
  factions: FactionSnapshot[];
  aas: AASnapshot[];
}

// ---------- facts ----------

export type Visibility = { kind: "public" } | { kind: "private"; faction: FactionId } | { kind: "player-only" };

export interface FactTags {
  factions: FactionId[];
  locations: LocationId[];
  threads: ThreadId[];
}

export interface Fact {
  id: FactId;
  text: string;
  turn: number;
  /** `seq` of the event that established it. */
  source: number;
  visibility: Visibility;
  tags: FactTags;
  status: "established" | "rumor";
  /** Where the fact came from, for context building and the UI. */
  origin: "turn-zero" | "brief" | "play";
  /** Factions that learned a private fact besides its owner (an AA's investigation, a notice). */
  knownBy: FactionId[];
}

export interface Thread {
  id: ThreadId;
  text: string;
  opened: number;
  closed?: number | undefined;
  facts: FactId[];
}

// ---------- state ----------

export interface FactionState extends FactionSnapshot {
  bonuses: BonusState[];
}

export type SecretStatus = "private" | "rumor" | "public";

export interface UncoveredSecret {
  /** 0-based index into the AA's Secret Table. */
  index: number;
  status: SecretStatus;
  /** Who knows it; empty when public. */
  knownBy: FactionId[];
  fact: FactId;
}

export interface AAState extends AASnapshot {
  /** Toward the player (solo_mode.qmd Part V, Disposition). */
  disposition: DispositionId;
  /** Current objective (changes on Adaptation). */
  objective: string;
  /** Was it acted upon in the last closed turn? (Reactor) */
  actedUponLastTurn: boolean;
  /** The faction that last affected it. (Reactor) */
  lastAffectedBy?: FactionId | undefined;
  /** It noticed a covert action of yours: its next [target] is you. Cleared when used. */
  targetsPlayerNext: boolean;
  /** Entries uncovered so far ("Cross it off; reroll duplicates"). */
  secrets: UncoveredSecret[];
  /** A Signal-4 Offer waiting for the player's answer at the next step 2. */
  signalOffer: boolean;
}

// ---------- deals and offers ----------

/** What a deal requires of one party. `turn` limits an obligation to one turn; without it, it
 * holds every turn the deal is active. */
export interface Obligation {
  kind: "act" | "refrain";
  description: string;
  turn?: number | undefined;
}

export type DealId = string;

export interface Deal {
  id: DealId;
  parties: FactionId[];
  terms: string;
  obligations: Record<FactionId, Obligation[]>;
  since: number;
  /** Last turn the deal runs (inclusive); open-ended without it. */
  until?: number | undefined;
  status: "active" | "broken" | "ended";
  brokenBy?: FactionId | undefined;
  brokenTurn?: number | undefined;
  /** The deal makes the AA a partner in the player's joint action (solo_mode.qmd Part V). */
  joint: boolean;
}

export interface DealTerms {
  text: string;
  obligations: Record<FactionId, Obligation[]>;
  until?: number | undefined;
  joint?: boolean | undefined;
}

export type OfferId = string;

export interface OfferState {
  id: OfferId;
  aa: FactionId;
  terms: DealTerms;
  odds: OfferOdds;
  answer?: Answer | undefined;
  /** Set once the answer is known. */
  followUp?: "accept-and-add" | "accept" | "accept-on-condition" | "refuse-with-counter" | "refuse" | "refuse-and-offend-or-leak";
  settled: boolean;
  deal?: DealId | undefined;
}

// ---------- actions and adjudication ----------

export type ActionId = string;
export type ActionClass = "unopposed" | "opposed" | "conflict";

export interface ActionState {
  id: ActionId;
  /** The acting faction; for a joint action, the one that declared it. */
  faction: FactionId;
  /** Everyone whose turn this action spends (joint actions: more than one). */
  participants: FactionId[];
  act: string;
  out: string;
  lev: string;
  /** A declared bonus, by name (player actions; AA bonuses are spent by rule at the roll). */
  bonus?: string | undefined;
  covert: boolean;
  /** Factions the action is aimed at. */
  targets: FactionId[];
  /** A faction whose Secret Table a success would roll on (solo_mode.qmd Part VI). */
  investigates?: FactionId | undefined;
  /** Where the action came from. */
  source: "player" | "table" | "obligation" | "exploit" | "rule" | "hold";
  citedFacts: FactId[];
}

export interface RolledAction {
  grade: Grade;
  keep: "high" | "low";
  roll: RollMeta;
  kept: number;
  effective: number;
  doubles: boolean;
  bonusEffect?: "weak-to-strong" | "4-5-to-6" | "no-effect" | undefined;
}

export interface AdjudicationState {
  grade?: Grade | undefined;
  gradeSource?: "player" | "oracle" | undefined;
  /** For an AA with a bonus: is the action within the bonus's scope? */
  bonusInScope?: boolean | undefined;
  rolled?: RolledAction | undefined;
  band?: Band | undefined;
  conflictOutcome?: "as-rolled" | "prevails" | "worse" | "standoff" | undefined;
  inspiration?: { use: boolean; table?: "especiallyGood" | "especiallyBad"; face?: number; effect?: string | undefined; applied?: boolean } | undefined;
  forceOfNature?: { use: boolean; face?: number } | undefined;
  /** Clock questions answered for this action: "addresses" on a 6, "worsens" on a 1 or a Force of Nature. */
  clock: { addresses?: boolean; worsens?: boolean; fonWorsens?: boolean };
  /** Secret checks this action's result called for, once settled. */
  secrets: { investigation?: boolean; six?: "both" | "one-and-crumb"; ownOne?: boolean; revealedToAA?: boolean };
  outcome?: string | undefined;
}

export interface ConflictGroup {
  id: string;
  class: ActionClass;
  actions: ActionId[];
  bothCanBeTrue?: boolean | undefined;
  resolved: boolean;
}

/** One AA's progress through step 4 (solo_mode.qmd Part X, 4. Generate AA Actions). */
export interface AATurnState {
  joint?: "pending" | "joined" | "declined" | undefined;
  /** Per deal: the cost answer and the keep check. */
  deals: Record<DealId, { costs?: boolean; kept?: boolean }>;
  threatened?: boolean | undefined;
  held?: string | undefined;
  table?: { index: number; entry: string } | undefined;
  /** Table rolls so far this turn (first roll, veto and deal rerolls). */
  rolls: number;
  vetoes: number;
  /** Why the entry is being rolled again, if it is. */
  lastReroll?: "veto" | "deal" | undefined;
  writeFromRule: boolean;
  target?: FactionId | undefined;
  action?: ActionId | undefined;
}

export interface TurnData {
  offers: Record<OfferId, OfferState>;
  aa: Record<FactionId, AATurnState>;
  actions: Record<ActionId, ActionState>;
  /** Action ids in the order they were declared or written. */
  order: ActionId[];
  groups?: ConflictGroup[] | undefined;
  adjudication: Record<ActionId, AdjudicationState>;
  signals: Record<FactionId, { face: number; signal: string; exposureAnswered?: boolean }>;
  /** Covert player actions: the notice check and, on a yes, who notices. */
  notice: Record<ActionId, { checked: boolean; noticed?: boolean; interested?: FactionId[]; by?: FactionId }>;
  /** Disposition causes already applied this turn, per AA (each cause once per turn). */
  causes: Record<FactionId, string[]>;
  dispositionAnswered: FactionId[];
  /** Adaptation rewrites still owed, per AA. */
  adaptation: Record<FactionId, string[]>;
  clockAdvanced: boolean;
  /** Standing as the turn's results suggest; the player confirms or reorders it in step 7. */
  standingProposal: FactionId[];
  standingSet: boolean;
  reported: boolean;
}

export interface ClockState {
  length: number;
  position: number;
  escalations: (Escalation & { landed: boolean })[];
}

export type GameStatus = "setup" | "playing" | "ended";

export interface GameState {
  seed: string;
  /** The `seq` the next event must carry. */
  nextSeq: number;
  /** Rng position after the last roll event. */
  rngPosition: number;
  status: GameStatus;
  turns: number;
  turn: number;
  step: Step;
  /** True between `TurnOpened` and `TurnClosed`. */
  turnOpen: boolean;
  player: FactionId;
  scenario: ScenarioSnapshot;
  factions: Readonly<Record<FactionId, FactionState>>;
  aa: Readonly<Record<FactionId, AAState>>;
  /** Dominant first, Exposed last (solo_mode.qmd Part IV, Standing). */
  standing: readonly FactionId[];
  clock: ClockState;
  facts: Readonly<Record<FactId, Fact>>;
  threads: Readonly<Record<ThreadId, Thread>>;
  deals: Readonly<Record<DealId, Deal>>;
  forceOfNatureUsed: number;
  /** The open turn's working data; reset by `TurnOpened`. */
  current: TurnData;
  /** Published Reports, by turn. */
  reports: Readonly<Record<number, Report>>;
  /** Written after the game ends; the latest version. */
  debrief?: Debrief | undefined;
}

/** solo_mode.qmd Part XI, The Debrief. */
export interface Debrief {
  /** One line per faction on where it ends. */
  closingFrame: Record<FactionId, string>;
  /** 1. Your objectives: achieved, or groundwork laid? Why? */
  objectives: string;
  /** 2. The AAs' objectives, compared with yours. */
  aaObjectives: string;
  /** 3. The surprise: which turn, and what produced it. */
  surprise: string;
  /** 4. The design: what you would change. */
  design: string;
}

export interface Report {
  header: string;
  paragraphs: string[];
  crumbs: string[];
  clockLine?: string | undefined;
  closing: string;
}
