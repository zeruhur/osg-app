import type {
  ActionClass,
  ActionId,
  ActionState,
  Answer,
  Band,
  BehaviorId,
  DealId,
  DealTerms,
  DispositionId,
  Escalation,
  EventMeta,
  FactId,
  FactionId,
  FactTags,
  Grade,
  OfferId,
  OfferOdds,
  OracleOdds,
  Report,
  RollMeta,
  ScenarioSnapshot,
  SecretStatus,
  Step,
  ThreadId,
  Visibility
} from "./types";

// The event log is the game. Events are appended, never edited; state is `fold(events)`.
// Events that roll carry a `roll: RollMeta`, enough to reproduce the roll.

export interface FactInput {
  id: FactId;
  text: string;
  visibility: Visibility;
  tags: FactTags;
  status: "established" | "rumor";
  origin: "turn-zero" | "brief" | "play";
}

// ---------- setup ----------

export interface GameCreated {
  type: "GameCreated";
  seed: string;
  turns: number;
  player: FactionId;
  scenario: ScenarioSnapshot;
}

export interface StandingSet {
  type: "StandingSet";
  /** Dominant first. */
  order: FactionId[];
  reason?: string | undefined;
}

export interface DispositionSet {
  type: "DispositionSet";
  aa: FactionId;
  disposition: DispositionId;
}

export interface ClockConfigured {
  type: "ClockConfigured";
  length: number;
  escalations: Escalation[];
}

export interface FactEstablished {
  type: "FactEstablished";
  fact: FactInput;
}

export interface ThreadOpened {
  type: "ThreadOpened";
  thread: { id: ThreadId; text: string; facts: FactId[] };
}

export interface ThreadClosed {
  type: "ThreadClosed";
  thread: ThreadId;
}

// ---------- turn ----------

export interface GameStarted {
  type: "GameStarted";
}

export interface TurnOpened {
  type: "TurnOpened";
  /** The turn this opens. (Not `turn`: every event's meta `turn` is the turn it happens in.) */
  opens: number;
}

export interface StepAdvanced {
  type: "StepAdvanced";
  to: Step;
}

export interface TurnClosed {
  type: "TurnClosed";
}

export interface GameEnded {
  type: "GameEnded";
}

// ---------- the Oracle ----------

/** Why the Oracle was asked: free questions, or a rule that asks it. */
export type OraclePurpose =
  | { kind: "question" }
  | { kind: "offer"; offer: OfferId }
  | { kind: "deal-keep"; deal: DealId; aa: FactionId }
  | { kind: "joint-confirm"; aa: FactionId; action: ActionId }
  | { kind: "grade"; action: ActionId }
  | { kind: "notice"; action: ActionId };

/** The odds are part of the same event as the roll: the command sets them before the engine rolls,
 * and nothing can change them after (solo_mode.qmd Part III, "Choose odds before you roll"). */
export interface OracleConsulted {
  type: "OracleConsulted";
  id: string;
  question: string;
  odds: OracleOdds;
  purpose: OraclePurpose;
  roll: RollMeta;
  kept: number;
  answer: Answer;
}

// ---------- step 2: talk ----------

export interface OfferMade {
  type: "OfferMade";
  id: OfferId;
  aa: FactionId;
  terms: DealTerms;
  fit: { advancesObjective: boolean; costsProtectedOrHelpsRival: boolean };
  odds: OfferOdds;
  steps: string[];
}

/** The Offer's result once its answer is known (from the roll, or without one at Refused/Accepted). */
export interface OfferAnswered {
  type: "OfferAnswered";
  id: OfferId;
  answer?: Answer | undefined;
  followUp: "accept-and-add" | "accept" | "accept-on-condition" | "refuse-with-counter" | "refuse" | "refuse-and-offend-or-leak";
}

export interface OfferSettled {
  type: "OfferSettled";
  id: OfferId;
  deal: boolean;
  /** Yes-and: what the AA adds. */
  addition?: "information" | "help" | "disposition" | undefined;
  /** Yes-but: the AA's condition (accepted, or the player walked away). */
  condition?: string | undefined;
  /** No-but: what it would accept instead. */
  counter?: string | undefined;
  /** No-and: offense (−1 disposition) or a leak (a crumb). */
  consequence?: "offense" | "leak" | undefined;
  /** The deal struck, if any (a `DealStruck` follows). */
  dealId?: string | undefined;
}

export interface DealStruck {
  type: "DealStruck";
  deal: { id: DealId; parties: FactionId[]; terms: DealTerms };
}

export interface SignalOfferAnswered {
  type: "SignalOfferAnswered";
  aa: FactionId;
  accept: boolean;
}

export interface DealKeepCostAnswered {
  type: "DealKeepCostAnswered";
  deal: DealId;
  aa: FactionId;
  costs: boolean;
}

export interface DealKept {
  type: "DealKept";
  deal: DealId;
  by: FactionId;
}

export interface DealBroken {
  type: "DealBroken";
  deal: DealId;
  by: FactionId;
}

export interface DealEnded {
  type: "DealEnded";
  deal: DealId;
}

export interface DispositionChanged {
  type: "DispositionChanged";
  aa: FactionId;
  from: DispositionId;
  to: DispositionId;
  /** The causes, each applied at most once per turn. */
  causes: string[];
}

// ---------- step 3: declare ----------

/** The player's action. Declaring is committing: from this event on it does not change
 * (solo_mode.qmd Part X, 3: "From here on, it does not change"). */
export interface ActionDeclared {
  type: "ActionDeclared";
  action: ActionState;
}

// ---------- step 4: AA actions ----------

export interface JointResolved {
  type: "JointResolved";
  aa: FactionId;
  action: ActionId;
  joined: boolean;
}

export interface ConsolidatorThreatAnswered {
  type: "ConsolidatorThreatAnswered";
  aa: FactionId;
  threatened: boolean;
}

export interface AAHeld {
  type: "AAHeld";
  aa: FactionId;
  reason: string;
  /** The unopposed consolidation action the hold creates. */
  action: ActionState;
}

export interface AATableRolled {
  type: "AATableRolled";
  aa: FactionId;
  roll: RollMeta;
  index: number;
  entry: string;
  reason: "roll" | "veto" | "deal";
}

export interface AAEntryVetoed {
  type: "AAEntryVetoed";
  aa: FactionId;
  /** Deal: the entry breaks a refrain obligation (reroll, not a veto). */
  reason: "veto" | "deal";
}

export interface TargetFilled {
  type: "TargetFilled";
  aa: FactionId;
  target: FactionId;
  reason: string;
}

export interface ActionAccepted {
  type: "ActionAccepted";
  action: ActionState;
}

// ---------- step 5: adjudicate ----------

export interface ActionsClassified {
  type: "ActionsClassified";
  groups: { id: string; class: ActionClass; actions: ActionId[] }[];
}

export interface ConflictJudged {
  type: "ConflictJudged";
  group: string;
  bothCanBeTrue: boolean;
}

export interface LeverageGraded {
  type: "LeverageGraded";
  action: ActionId;
  grade: Grade;
  source: "player" | "oracle";
  bonusInScope?: boolean | undefined;
}

export interface DiceRolled {
  type: "DiceRolled";
  action: ActionId;
  grade: Grade;
  keep: "high" | "low";
  roll: RollMeta;
  kept: number;
  effective: number;
  doubles: boolean;
  bonusEffect?: "weak-to-strong" | "4-5-to-6" | "no-effect" | undefined;
}

export interface BonusSpent {
  type: "BonusSpent";
  faction: FactionId;
  bonus: string;
  action: ActionId;
}

export interface ResultBanded {
  type: "ResultBanded";
  action: ActionId;
  band: Band;
  outcome: "unopposed" | "rolled" | "as-rolled" | "prevails" | "worse" | "standoff";
}

export interface InspirationAnswered {
  type: "InspirationAnswered";
  action: ActionId;
  use: boolean;
}

export interface InspirationRolled {
  type: "InspirationRolled";
  action: ActionId;
  table: "especiallyGood" | "especiallyBad";
  roll: RollMeta;
  face: number;
  text: string;
  effect?: string | undefined;
}

/** A mechanical Inspiration effect applied (or proposed, for Standing). */
export interface InspirationApplied {
  type: "InspirationApplied";
  action: ActionId;
  effect: string;
  target?: FactionId | undefined;
}

export interface ForceOfNatureAnswered {
  type: "ForceOfNatureAnswered";
  action: ActionId;
  use: boolean;
}

export interface ForceOfNatureRolled {
  type: "ForceOfNatureRolled";
  action: ActionId;
  roll: RollMeta;
  face: number;
  text: string;
}

export interface ClockEffectAnswered {
  type: "ClockEffectAnswered";
  action: ActionId;
  /** addresses: a 6 whose Outcome addresses the Problem; worsens: a 1's especially bad, or a
   * Force of Nature, made the Problem worse. */
  question: "addresses" | "worsens" | "fon-worsens";
  yes: boolean;
}

export interface ClockMoved {
  type: "ClockMoved";
  delta: number;
  reason: "turn" | "problem-addressed" | "problem-worsened" | "inspiration";
  position: number;
}

export interface EscalationLanded {
  type: "EscalationLanded";
  box: number;
}

export interface SecretRolled {
  type: "SecretRolled";
  aa: FactionId;
  roll: RollMeta;
  index: number;
  status: SecretStatus;
  /** Who learns it; empty when public. */
  knownBy: FactionId[];
  fact: FactInput;
  cause: "investigation" | "own-one" | "exposure" | "inspiration";
  action?: ActionId | undefined;
}

/** Marks a secret check settled, whether or not it rolled anything (all six may be out already). */
export interface SecretsResolved {
  type: "SecretsResolved";
  action: ActionId;
  kind: "investigation" | "own-one";
}

export interface InvestigationSixAnswered {
  type: "InvestigationSixAnswered";
  action: ActionId;
  /** Keep both secrets, or keep one and gain a crumb on another faction. */
  keep: "both" | "one-and-crumb";
  crumbOn?: FactionId | undefined;
}

export interface SecretConfirmed {
  type: "SecretConfirmed";
  aa: FactionId;
  index: number;
}

/** An AA's successful investigation of the player: it learns a private Position fact or a past
 * covert action of the player's choice (solo_mode.qmd Part VI, Investigated by an AA). */
export interface FactRevealed {
  type: "FactRevealed";
  fact: FactId;
  to: FactionId;
  action?: ActionId | undefined;
}

export interface OutcomeAccepted {
  type: "OutcomeAccepted";
  action: ActionId;
  text: string;
  friction?: string | undefined;
  facts: FactInput[];
}

// ---------- step 6: signals and notice ----------

export interface SignalRolled {
  type: "SignalRolled";
  aa: FactionId;
  roll: RollMeta;
  face: number;
  signal: "silence" | "warning" | "offer" | "exposure" | "windfall";
}

export interface ExposureAnswered {
  type: "ExposureAnswered";
  aa: FactionId;
  /** Does the vulnerability fit a secret better than a new invention? */
  rollSecret: boolean;
}

export interface InterestedAnswered {
  type: "InterestedAnswered";
  action: ActionId;
  aas: FactionId[];
}

export interface CovertNoticed {
  type: "CovertNoticed";
  action: ActionId;
  by: FactionId;
  roll?: RollMeta | undefined;
}

// ---------- step 7: update ----------

export interface DispositionCausesAnswered {
  type: "DispositionCausesAnswered";
  aa: FactionId;
  keptDealOrBenefited: boolean;
  harmed: boolean;
}

export interface TableEntryRewritten {
  type: "TableEntryRewritten";
  aa: FactionId;
  index: number;
  text: string;
  trigger: string;
}

export interface ObjectiveChanged {
  type: "ObjectiveChanged";
  aa: FactionId;
  objective: string;
  reason: "achieved" | "impossible";
}

export interface BehaviorRerolled {
  type: "BehaviorRerolled";
  aa: FactionId;
  roll: RollMeta;
  behavior: BehaviorId;
}

// ---------- step 8: report ----------

export interface ReportPublished {
  type: "ReportPublished";
  report: Report;
  threads: { id: ThreadId; text: string; facts: FactId[] }[];
}

export type EventBody =
  | GameCreated
  | StandingSet
  | DispositionSet
  | ClockConfigured
  | FactEstablished
  | ThreadOpened
  | ThreadClosed
  | GameStarted
  | TurnOpened
  | StepAdvanced
  | TurnClosed
  | GameEnded
  | OracleConsulted
  | OfferMade
  | OfferAnswered
  | OfferSettled
  | DealStruck
  | SignalOfferAnswered
  | DealKeepCostAnswered
  | DealKept
  | DealBroken
  | DealEnded
  | DispositionChanged
  | ActionDeclared
  | JointResolved
  | ConsolidatorThreatAnswered
  | AAHeld
  | AATableRolled
  | AAEntryVetoed
  | TargetFilled
  | ActionAccepted
  | ActionsClassified
  | ConflictJudged
  | LeverageGraded
  | DiceRolled
  | BonusSpent
  | ResultBanded
  | InspirationAnswered
  | InspirationRolled
  | InspirationApplied
  | ForceOfNatureAnswered
  | ForceOfNatureRolled
  | ClockEffectAnswered
  | ClockMoved
  | EscalationLanded
  | SecretRolled
  | SecretsResolved
  | InvestigationSixAnswered
  | SecretConfirmed
  | FactRevealed
  | OutcomeAccepted
  | SignalRolled
  | ExposureAnswered
  | InterestedAnswered
  | CovertNoticed
  | DispositionCausesAnswered
  | TableEntryRewritten
  | ObjectiveChanged
  | BehaviorRerolled
  | ReportPublished;

export type GameEvent = EventMeta & EventBody;
export type EventType = EventBody["type"];
export type EventOf<T extends EventType> = Extract<GameEvent, { type: T }>;

// Compile-time guard: no payload may reuse a meta field name (`seq`, `turn`, `step`, `author`),
// or stamping the meta would silently overwrite it. Fails to typecheck if one does.
type MetaClash = EventBody extends infer B ? (B extends unknown ? Extract<keyof B, keyof EventMeta> : never) : never;
export const NO_META_CLASH: [MetaClash] extends [never] ? true : never = true;
