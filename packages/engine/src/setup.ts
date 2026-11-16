import type { ScenarioPack } from "@osg/rules-data";
import { EngineError } from "./errors";
import type { EventBody, GameEvent } from "./events";
import type { AASnapshot, FactionId, FactionSnapshot, FactTags, ScenarioSnapshot, Visibility } from "./types";

export interface SetupOptions {
  /** Variant id from the pack; defaults to the recommended one. */
  variant?: string;
  /** The faction the player takes. */
  player: FactionId;
  seed: string;
  /** Overrides the variant's turn count (solo_mode.qmd Part IX: 4, 6 or 8). */
  turns?: number;
}

/** The opening events of a game from a scenario pack: the scenario snapshot, Standing, each AA's
 * disposition toward the player, the Crisis Clock, and the established facts (Turn Zero answers,
 * every faction's public line, Position bullets as facts private to their faction).
 * The game is still in setup afterwards; `GameStarted` begins Turn 1. */
export function setupGame(pack: ScenarioPack, options: SetupOptions): GameEvent[] {
  const variant = options.variant
    ? pack.variants.find((v) => v.id === options.variant)
    : (pack.variants.find((v) => v.recommended) ?? pack.variants[0]);
  if (!variant) throw new EngineError("invalid", `pack ${pack.id} has no variant ${options.variant}`);
  if (!variant.factions.includes(options.player)) {
    throw new EngineError("invalid", `${options.player} is not a playable faction in ${pack.id}/${variant.id}`);
  }
  const turns = options.turns ?? variant.turns;
  if (!Number.isInteger(turns) || turns < 4 || turns > 8) throw new EngineError("invalid", `turns must be 4 to 8, got ${turns}`);

  const byId = new Map(pack.factions.map((f) => [f.id, f]));
  const pick = (id: string) => {
    const f = byId.get(id);
    if (!f) throw new EngineError("invalid", `pack ${pack.id} has no faction ${id}`);
    return f;
  };

  const factions: FactionSnapshot[] = [];
  const aas: AASnapshot[] = [];
  for (const id of [...variant.factions, ...variant.background]) {
    const f = pick(id);
    const kind = id === options.player ? "player" : variant.factions.includes(id) ? "aa" : "background";
    if (kind === "player") {
      factions.push({
        id, name: f.name, kind, public: f.public,
        objectives: { shortTerm: f.asPlayer.shortTerm, longTerm: f.asPlayer.longTerm },
        // The player brief has no leverage field; the faction's leverage is the same either way.
        leverage: { ...f.asAA.leverage },
        bonuses: [{ ...f.asPlayer.bonus }]
      });
    } else {
      factions.push({
        id, name: f.name, kind, public: f.public,
        objectives: { shortTerm: f.asAA.objective },
        leverage: { ...f.asAA.leverage },
        // Background factions take no actions, so they spend no bonuses.
        bonuses: kind === "aa" && f.asAA.bonus ? [{ ...f.asAA.bonus }] : []
      });
    }
    if (kind === "aa") {
      aas.push({ faction: id, behavior: f.asAA.behavior, actionTable: [...f.asAA.actionTable], secretTable: [...f.asAA.secretTable] });
    }
  }

  const scenario: ScenarioSnapshot = {
    packId: pack.id,
    title: pack.title,
    variant: variant.id,
    problem: pack.problem,
    world: pack.world,
    map: pack.map.map((l) => ({ ...l })),
    unsettled: [...pack.unsettled],
    factions,
    aas
  };

  const tagger = makeTagger(scenario);
  const bodies: EventBody[] = [
    { type: "GameCreated", seed: options.seed, turns, player: options.player, scenario },
    { type: "StandingSet", order: [...variant.standing], reason: "Starting Standing" },
    ...aas.map((a): EventBody => {
      const disposition = pack.startingDisposition[a.faction]?.[options.player];
      if (!disposition) throw new EngineError("invalid", `no starting disposition for ${a.faction} toward ${options.player}`);
      return { type: "DispositionSet", aa: a.faction, disposition };
    }),
    { type: "ClockConfigured", length: pack.clock.length, escalations: pack.clock.escalations.map((e) => ({ ...e })) }
  ];

  const fact = (id: string, text: string, visibility: Visibility, origin: "turn-zero" | "brief", own?: FactionId): EventBody => {
    const tags = tagger(text);
    if (own && !tags.factions.includes(own)) tags.factions.unshift(own);
    return { type: "FactEstablished", fact: { id, text, visibility, tags, status: "established", origin } };
  };

  pack.turnZero.forEach((text, i) => bodies.push(fact(`tz-${i + 1}`, text, { kind: "public" }, "turn-zero")));
  for (const f of factions) {
    bodies.push(fact(`${f.id}-public`, f.public, { kind: "public" }, "brief", f.id));
    const source = pick(f.id);
    const own: Visibility = { kind: "private", faction: f.id };
    if (f.kind === "player") {
      source.asPlayer.position.forEach((p, i) => bodies.push(fact(`${f.id}-position-${i + 1}`, p, own, "brief", f.id)));
    } else if (f.kind === "aa") {
      bodies.push(fact(`${f.id}-position`, source.asAA.position, own, "brief", f.id));
    }
  }

  return bodies.map((body, seq) => ({ ...body, seq, turn: 0, step: 0, author: "engine" }) as GameEvent);
}

/** Tags a fact with the factions and locations its text names. Faction names are matched by their
 * distinctive word ("House Meranto" by "Meranto"); location names without a leading "The". */
function makeTagger(scenario: ScenarioSnapshot): (text: string) => FactTags {
  const word = (name: string) => name.replace(/^(The|House)\s+/i, "");
  const matcher = (name: string) => new RegExp(`\\b${word(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const factions = scenario.factions.map((f) => ({ id: f.id, re: matcher(f.name) }));
  const locations = scenario.map.map((l) => ({ id: l.id, re: matcher(l.name) }));
  return (text) => ({
    factions: factions.filter((f) => f.re.test(text)).map((f) => f.id),
    locations: locations.filter((l) => l.re.test(text)).map((l) => l.id),
    threads: []
  });
}
