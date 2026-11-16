import { z } from "zod";

// Every schema is strict: an unknown field in the JSON is an error, so a typo can't hide.

/** The six standard leverage types (solo_mode.qmd Part IV, The AA Brief). A scenario may use its
 * own ("or the scenario's own"), so fields that hold a leverage accept any lowercase id. */
export const STANDARD_LEVERAGE = ["military", "economic", "geographic", "informational", "legitimacy", "popular"] as const;
export const LeverageId = z.string().regex(/^[a-z][a-z-]*$/, "leverage ids are lowercase words");
export const StandardLeverage = z.enum(STANDARD_LEVERAGE);

export const BehaviorId = z.enum(["consolidator", "aggressor", "opportunist", "balancer", "reactor", "schemer"]);
export const DispositionId = z.enum(["hostile", "wary", "neutral", "open", "allied"]);
export const OracleOddsId = z.enum(["likely", "even", "unlikely"]);
export const AnswerId = z.enum(["yes-and", "yes", "yes-but", "no-but", "no", "no-and"]);
export const BandId = z.enum(["especially-good", "success", "worse", "especially-bad"]);
export const KeepId = z.enum(["high", "low"]);

const Text = z.string().min(1);
const Face = z.number().int().min(1).max(6);

/** Where a table comes from: a heading path in a rules file and the table's index under it. */
export const TableSource = z.strictObject({
  file: z.literal("solo_mode.qmd"),
  heading: Text,
  table: z.number().int().nonnegative()
});
/** A source that isn't a table: a paragraph (named by its opening words) or a whole section. */
export const ParagraphSource = z.strictObject({ file: z.literal("solo_mode.qmd"), heading: Text, paragraph: Text });
export const HeadingSource = z.strictObject({ file: z.literal("solo_mode.qmd"), heading: Text });

/** Rows with `face` 1..6, in order. */
function d6Rows<T extends z.ZodObject<{ face: typeof Face }>>(row: T) {
  return z
    .array(row)
    .length(6)
    .refine((rows) => rows.every((r, i) => r.face === i + 1), "faces must be 1..6 in order");
}

/** Rows with `min`..`max` ranges that cover 1..6 exactly once, in any order. */
function rangeRows<T extends z.ZodObject<{ min: typeof Face; max: typeof Face }>>(row: T) {
  return z.array(row).refine((rows) => {
    const hits = [0, 0, 0, 0, 0, 0];
    for (const r of rows) {
      if (r.min > r.max) return false;
      for (let f = r.min; f <= r.max; f++) hits[f - 1]!++;
    }
    return hits.every((h) => h === 1);
  }, "ranges must cover 1..6 exactly once");
}

/** Six entries, one per face. */
const SixEntries = z.array(Text).length(6);

// ---------- core.json ----------

export const Core = z.strictObject({
  leverage: z.strictObject({
    source: TableSource,
    rows: z.array(z.strictObject({ grade: z.enum(["strong", "weak"]), keep: KeepId, text: Text })).length(2)
  }),
  results: z.strictObject({
    source: TableSource,
    rows: rangeRows(z.strictObject({ min: Face, max: Face, id: BandId, label: Text, text: Text }))
  }),
  oracleOdds: z.strictObject({
    source: TableSource,
    rows: z
      .array(
        z.strictObject({
          id: OracleOddsId,
          name: Text,
          roll: z.union([z.strictObject({ dice: z.literal(2), keep: KeepId }), z.strictObject({ dice: z.literal(1) })]),
          rollText: Text,
          yes: Text
        })
      )
      .length(3)
  }),
  oracleAnswers: z.strictObject({
    source: TableSource,
    rows: z
      .array(z.strictObject({ face: Face, id: AnswerId, text: Text }))
      .length(6)
      .refine((rows) => new Set(rows.map((r) => r.face)).size === 6, "one answer per face")
  })
});

// ---------- behavior-rules.json ----------

export const BehaviorRules = z.strictObject({
  source: TableSource,
  rows: d6Rows(z.strictObject({ face: Face, id: BehaviorId, name: Text, rule: Text }))
});

// ---------- disposition.json ----------

const KeepOdds = z.enum(["none", "even", "likely", "automatic"]);

export const Disposition = z
  .strictObject({
    source: TableSource,
    scale: z.array(DispositionId).length(5),
    rows: z
      .array(
        z.strictObject({
          id: DispositionId,
          name: Text,
          offers: Text,
          targeting: Text,
          keepingDeals: Text,
          keepOdds: KeepOdds,
          schemerKeepOdds: KeepOdds.optional()
        })
      )
      .length(5)
  })
  .refine((d) => d.rows.every((r, i) => r.id === d.scale[i]), "rows must follow the scale, Hostile to Allied");

// ---------- offer-results.json ----------

export const OfferResults = z.strictObject({
  source: TableSource,
  rows: z.array(z.strictObject({ id: AnswerId, answer: Text, result: Text })).length(6)
});

// ---------- signals.json ----------

export const Signals = z.strictObject({
  source: TableSource,
  rows: rangeRows(
    z.strictObject({
      min: Face,
      max: Face,
      id: z.enum(["silence", "warning", "offer", "exposure", "windfall"]),
      name: Text,
      text: z.string()
    })
  )
});

// ---------- secrets-generic.json / aa-actions-generic.json ----------

const LeverageColumn = z.strictObject({ source: TableSource, column: Text, entries: SixEntries });
/** One six-entry table per standard leverage type. */
export const ByLeverage = z.strictObject(
  Object.fromEntries(STANDARD_LEVERAGE.map((l) => [l, LeverageColumn])) as Record<
    (typeof STANDARD_LEVERAGE)[number],
    typeof LeverageColumn
  >
);

// ---------- inspiration.json ----------

export const InspirationEffect = z.enum([
  "roll-secret",
  "rival-down",
  "disposition-up",
  "clock-back",
  "exposed",
  "disposition-down",
  "lose-asset",
  "rival-up",
  "add-vulnerability",
  "clock-forward"
]);

const InspirationTable = z.strictObject({
  source: TableSource,
  column: Text,
  rows: d6Rows(z.strictObject({ face: Face, text: Text, effect: InspirationEffect.optional() }))
});

export const Inspiration = z.strictObject({
  especiallyGood: InspirationTable,
  especiallyBad: InspirationTable,
  friction: InspirationTable,
  forceOfNature: InspirationTable
});

// ---------- generator.json ----------

/** One d66 category: six rows sharing the tens digit, units 1..6 in order. */
const D66Category = z
  .strictObject({
    source: TableSource,
    category: Text,
    rows: z.array(z.strictObject({ roll: z.number().int(), text: Text })).length(6)
  })
  .refine((c) => {
    const tens = Math.floor(c.rows[0]!.roll / 10);
    return tens >= 1 && tens <= 6 && c.rows.every((r, i) => r.roll === tens * 10 + i + 1);
  }, "d66 rows must share a tens digit 1..6 and run units 1..6");

/** Six categories, one per tens digit 1..6 in order: together a full d66 table. */
function d66Table<T extends z.ZodType<z.infer<typeof D66Category>>>(category: T) {
  return z
    .array(category)
    .length(6)
    .refine((cats) => cats.every((c, i) => Math.floor(c.rows[0]!.roll / 10) === i + 1), "tens digits must be 1..6 in order");
}

const ArchetypeCategory = z
  .strictObject({
    source: TableSource,
    category: Text,
    leverage: StandardLeverage,
    rows: z.array(z.strictObject({ roll: z.number().int(), text: Text })).length(6)
  })
  .refine((c) => {
    const tens = Math.floor(c.rows[0]!.roll / 10);
    return tens >= 1 && tens <= 6 && c.rows.every((r, i) => r.roll === tens * 10 + i + 1);
  }, "d66 rows must share a tens digit 1..6 and run units 1..6");

const FaceText = d6Rows(z.strictObject({ face: Face, text: Text }));

export const Generator = z.strictObject({
  event: d66Table(D66Category),
  absence: d66Table(D66Category),
  stake: z.strictObject({ source: TableSource, rows: FaceText }),
  archetype: d66Table(ArchetypeCategory),
  secondaryLeverage: z.strictObject({
    source: ParagraphSource,
    rows: d6Rows(z.strictObject({ face: Face, leverage: StandardLeverage }))
  }),
  stance: z.strictObject({
    source: TableSource,
    rows: d6Rows(
      z.strictObject({
        face: Face,
        id: z.enum(["claimant", "guardian", "threatened", "opportunist", "creditor", "outsider"]),
        name: Text,
        description: Text,
        shortTerm: Text,
        longTerm: Text,
        behavior: BehaviorId
      })
    )
  }),
  vulnerability: z.strictObject({ source: TableSource, rows: FaceText }),
  tie: z.strictObject({ source: TableSource, column: Text, rows: FaceText }),
  escalation: z.strictObject({ source: TableSource, rows: d6Rows(z.strictObject({ face: Face, name: Text, text: Text })) }),
  location: z.strictObject({ source: TableSource, rows: FaceText })
});

// ---------- packs/*.json ----------

const Id = z.string().regex(/^[a-z][a-z0-9-]*$/, "ids are lowercase kebab-case");

export const Bonus = z.strictObject({ name: Text, uses: z.number().int().min(1), text: Text.optional() });

export const PackFaction = z.strictObject({
  id: Id,
  name: Text,
  title: Text,
  public: Text,
  asPlayer: z.strictObject({
    shortTerm: Text,
    longTerm: Text,
    position: z.array(Text).min(1),
    bonus: Bonus
  }),
  asAA: z.strictObject({
    source: HeadingSource,
    objective: Text,
    position: Text,
    leverage: z.strictObject({ primary: LeverageId, secondary: LeverageId.optional() }),
    behavior: BehaviorId,
    bonus: Bonus.optional(),
    actionTable: SixEntries,
    secretTable: SixEntries
  })
});

export const ScenarioPack = z
  .strictObject({
    id: Id,
    title: Text,
    source: HeadingSource,
    problem: Text,
    world: Text,
    map: z.array(z.strictObject({ id: Id, name: Text, notes: Text, contested: z.boolean() })).min(3).max(5),
    turnZero: z.array(Text).max(5),
    unsettled: z.array(Text),
    clock: z.strictObject({
      length: z.number().int().min(1),
      escalations: z.array(
        z.strictObject({ box: z.number().int().min(1), title: Text, text: Text, breakingPoint: z.boolean() })
      )
    }),
    variants: z
      .array(
        z.strictObject({
          id: Id,
          turns: z.number().int().min(4).max(8),
          factions: z.array(Id).min(3).max(5),
          background: z.array(Id),
          standing: z.array(Id),
          recommended: z.boolean()
        })
      )
      .min(1),
    startingDisposition: z.record(Id, z.record(Id, DispositionId)),
    factions: z.array(PackFaction).min(3)
  })
  .superRefine((pack, ctx) => {
    const ids = new Set(pack.factions.map((f) => f.id));
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });

    if (ids.size !== pack.factions.length) issue("faction ids must be unique", ["factions"]);
    if (!pack.map.some((l) => l.contested)) issue("at least one location must be contested", ["map"]);

    // solo_mode.qmd Part VII, The Clock: the last Escalation is the Breaking Point.
    const esc = pack.clock.escalations;
    const last = esc[esc.length - 1];
    if (!last || !last.breakingPoint || last.box !== pack.clock.length) {
      issue("the last escalation must be the Breaking Point, on the last box", ["clock"]);
    }
    if (esc.filter((e) => e.breakingPoint).length !== 1) issue("exactly one Breaking Point", ["clock"]);
    if (!esc.every((e, i) => i === 0 || e.box > esc[i - 1]!.box)) issue("escalation boxes must increase", ["clock"]);

    pack.variants.forEach((v, vi) => {
      for (const f of [...v.factions, ...v.background]) {
        if (!ids.has(f)) issue(`unknown faction ${f}`, ["variants", vi]);
      }
      const sorted = (xs: string[]) => [...xs].sort().join(",");
      if (sorted(v.standing) !== sorted(v.factions)) {
        issue("standing must order exactly the variant's active factions", ["variants", vi, "standing"]);
      }
      if (v.factions.some((f) => v.background.includes(f))) issue("a faction is either active or background", ["variants", vi]);
    });

    // Every AA has a disposition toward every faction the player could pick, and none toward itself.
    for (const aa of ids) {
      const row = pack.startingDisposition[aa];
      if (!row) {
        issue(`no starting disposition for ${aa}`, ["startingDisposition"]);
        continue;
      }
      const cols = Object.keys(row).sort().join(",");
      const expected = [...ids].filter((f) => f !== aa).sort().join(",");
      if (cols !== expected) issue(`${aa} needs a disposition toward each other faction`, ["startingDisposition", aa]);
    }
  });

export type Core = z.infer<typeof Core>;
export type BehaviorRules = z.infer<typeof BehaviorRules>;
export type Disposition = z.infer<typeof Disposition>;
export type OfferResults = z.infer<typeof OfferResults>;
export type Signals = z.infer<typeof Signals>;
export type ByLeverage = z.infer<typeof ByLeverage>;
export type Inspiration = z.infer<typeof Inspiration>;
export type InspirationEffect = z.infer<typeof InspirationEffect>;
export type Generator = z.infer<typeof Generator>;
export type Bonus = z.infer<typeof Bonus>;
export type PackFaction = z.infer<typeof PackFaction>;
export type ScenarioPack = z.infer<typeof ScenarioPack>;
export type BehaviorId = z.infer<typeof BehaviorId>;
export type DispositionId = z.infer<typeof DispositionId>;
export type OracleOddsId = z.infer<typeof OracleOddsId>;
export type AnswerId = z.infer<typeof AnswerId>;
export type BandId = z.infer<typeof BandId>;
