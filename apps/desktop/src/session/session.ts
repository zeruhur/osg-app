import type { Rng } from "@osg/dice";
import {
  EngineError,
  execute,
  fold,
  nextRequired,
  setupGame,
  type Author,
  type Command,
  type GameEvent,
  type GameState,
  type Requirements
} from "@osg/engine";
import { packs } from "@osg/rules-data";
import type { CampaignMeta, CampaignStore, StoredBatch } from "../store";

export interface NewCampaign {
  packId: string;
  variant: string;
  player: string;
  turns: number;
  title: string;
}

export interface SessionOptions {
  /** Clock for timestamps; tests pass a fixed one. */
  now?: () => string;
  /** Makes ids and seeds; tests pass a fixed one. */
  newId?: () => string;
  /** Overrides the engine's seeded Rng (tests only: scripted dice). */
  rng?: Rng;
}

/** A user-facing failure: the command was refused and nothing changed. */
export class CommandRefused extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "CommandRefused";
  }
}

const defaults = {
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID()
};

/** One open campaign: the engine state, its log in batches, and the store behind it.
 * No React here; `useCampaign` wraps it. Every change is persisted before it is shown. */
export class CampaignSession {
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private snapshot: { state: GameState; batches: readonly StoredBatch[]; meta: CampaignMeta };

  private constructor(
    private readonly store: CampaignStore,
    meta: CampaignMeta,
    batches: StoredBatch[],
    private readonly options: SessionOptions
  ) {
    this.snapshot = { state: fold(batches.flatMap((b) => b.events)), batches, meta };
  }

  static async create(store: CampaignStore, input: NewCampaign, options: SessionOptions = {}): Promise<CampaignSession> {
    const now = (options.now ?? defaults.now)();
    const id = (options.newId ?? defaults.newId)();
    const pack = packs[input.packId];
    if (!pack) throw new CommandRefused(`Unknown scenario ${input.packId}`, "invalid");
    const setup = setupGame(pack, { variant: input.variant, player: input.player, seed: id, turns: input.turns });
    const player = pack.factions.find((f) => f.id === input.player)!;
    const meta: CampaignMeta = {
      id,
      title: input.title.trim() || `${pack.title}: ${player.name}`,
      packId: pack.id,
      packTitle: pack.title,
      variant: input.variant,
      player: input.player,
      playerName: player.name,
      turns: input.turns,
      turn: 0,
      status: "setup",
      createdAt: now,
      updatedAt: now
    };
    await store.create(meta, setup);
    return new CampaignSession(store, meta, [{ batch: 0, command: "setup", at: now, events: setup }], options);
  }

  static async open(store: CampaignStore, id: string, options: SessionOptions = {}): Promise<CampaignSession> {
    const { meta, batches } = await store.load(id);
    return new CampaignSession(store, meta, batches, options);
  }

  get id(): string {
    return this.snapshot.meta.id;
  }
  get state(): GameState {
    return this.snapshot.state;
  }
  get meta(): CampaignMeta {
    return this.snapshot.meta;
  }
  get batches(): readonly StoredBatch[] {
    return this.snapshot.batches;
  }
  get log(): GameEvent[] {
    return this.snapshot.batches.flatMap((b) => b.events);
  }
  requirements(): Requirements {
    return nextRequired(this.snapshot.state);
  }

  /** For useSyncExternalStore. The snapshot object changes on every change, never otherwise. */
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Runs a command: engine first (nothing changes if it refuses), then the store, then memory. */
  run(command: Command, author?: Author): Promise<GameEvent[]> {
    return this.serial(async () => {
      const { state, batches, meta } = this.snapshot;
      let result;
      try {
        result = execute(state, command, { ...(this.options.rng ? { rng: this.options.rng } : {}), ...(author ? { author } : {}) });
      } catch (e) {
        if (e instanceof EngineError) throw new CommandRefused(e.message, e.code);
        throw e;
      }
      const batch: StoredBatch = { batch: batches.length, command: command.type, at: this.now(), events: result.events };
      const patch = this.metaPatch(result.state, batch.at);
      await this.store.append(meta.id, batch, patch);
      this.set({ state: result.state, batches: [...batches, batch], meta: { ...meta, ...patch } });
      return result.events;
    });
  }

  /** Steps back one command. Dice come from (seed, position), so redoing the same command rolls the
   * same dice: undo can't be used to reroll. Returns false at the start of the game. */
  undo(): Promise<boolean> {
    return this.serial(async () => {
      const { batches, meta } = this.snapshot;
      if (batches.length <= 1) return false;
      const kept = batches.slice(0, -1);
      const state = fold(kept.flatMap((b) => b.events));
      const patch = this.metaPatch(state, this.now());
      await this.store.undo(meta.id, patch);
      this.set({ state, batches: kept, meta: { ...meta, ...patch } });
      return true;
    });
  }

  private metaPatch(state: GameState, at: string): Partial<CampaignMeta> {
    return { turn: state.turn, status: state.status, updatedAt: at };
  }

  private now(): string {
    return (this.options.now ?? defaults.now)();
  }

  private set(snapshot: typeof this.snapshot): void {
    this.snapshot = snapshot;
    for (const l of this.listeners) l();
  }

  /** One change at a time: a second click waits for the first command to land. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
