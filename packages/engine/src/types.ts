import type { BehaviorId, DispositionId } from "@osg/rules-data";

export type { BehaviorId, DispositionId };

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

export interface AAState extends AASnapshot {
  /** Toward the player (solo_mode.qmd Part V, Disposition). */
  disposition: DispositionId;
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
}
