export type EngineErrorCode =
  /** An event's `seq` is not the next one. */
  | "bad-sequence"
  /** The first event isn't `GameCreated`, or `GameCreated` appears twice. */
  | "no-game"
  /** The event can't happen in the current turn or step. */
  | "out-of-order"
  /** The event refers to something that doesn't exist or is inconsistent with the state. */
  | "invalid";

/** Thrown by the reducer for an event that can't apply. A well-formed log never throws: commands
 * check first. A throw while folding means a corrupted or hand-edited log. */
export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
    readonly seq?: number
  ) {
    super(seq === undefined ? message : `#${seq}: ${message}`);
    this.name = "EngineError";
  }
}
