import type {
  DispositionId,
  Escalation,
  EventMeta,
  FactId,
  FactionId,
  FactTags,
  ScenarioSnapshot,
  Step,
  ThreadId,
  Visibility
} from "./types";

// The event log is the game. Events are appended, never edited; state is `fold(events)`.
// This union grows milestone by milestone (Offers, actions, adjudication, ...): see
// docs/phase-1-engine.md section 4.3.

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
  fact: {
    id: FactId;
    text: string;
    visibility: Visibility;
    tags: FactTags;
    status: "established" | "rumor";
    origin: "turn-zero" | "brief" | "play";
  };
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
  | GameEnded;

export type GameEvent = EventMeta & EventBody;
export type EventType = EventBody["type"];
export type EventOf<T extends EventType> = Extract<GameEvent, { type: T }>;

// Compile-time guard: no payload may reuse a meta field name (`seq`, `turn`, `step`, `author`),
// or stamping the meta would silently overwrite it. Fails to typecheck if one does.
type MetaClash = EventBody extends infer B ? (B extends unknown ? Extract<keyof B, keyof EventMeta> : never) : never;
export const NO_META_CLASH: [MetaClash] extends [never] ? true : never = true;
