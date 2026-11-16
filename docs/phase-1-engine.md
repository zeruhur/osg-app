# Phase 1 (M0): Rules Engine — Implementation Spec

Scope: everything in M0 of `docs/PLAN.md`. Workspace, `packages/dice`, `packages/engine`, `packages/rules-data`, the drift and replay tests, and `apps/sim`. **Out of scope:** UI, LLM calls, Factionlog, storage, group play.

Rule references cite `rules/osg/docs/<file>.qmd` at upstream commit `0d96334`. "Solo" = `solo_mode.qmd`; "CG" = `contested_ground.qmd`.

---

## 0. Ground rules for this phase

- `packages/engine` imports only `packages/dice` (types and the `Rng` interface) and `zod`. No IO, no `Date`, no `Math.random`, no `crypto`.
- Dice faces are **stored in events**. The reducer never rolls. Rolling happens only in command handlers, through the `Rng` passed in.
- Every rule function has a source comment: `// Solo Part V, Making an Offer`.
- Judgment is never coded as a heuristic. It is a **decision point** (section 4.4). The sim answers decision points with policies; M1's UI will ask the player.
- One commit per work step (section 9). Run `tsc --noEmit` and the tests before each commit.

---

## 1. Workspace

```
.
├─ package.json              private; scripts: test, typecheck, sim
├─ pnpm-workspace.yaml       packages: [packages/*, apps/*]
├─ tsconfig.base.json        strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes,
│                            module/moduleResolution "NodeNext" (or "Bundler"), target ES2022
├─ vitest.workspace.ts       one project per package
├─ .github/workflows/ci.yml  checkout (submodules: true), pnpm, node 22, typecheck, test
├─ rules/osg/                submodule @ 0d96334
├─ packages/{dice,engine,rules-data}/
└─ apps/sim/
```

- Package names: `@osg/dice`, `@osg/engine`, `@osg/rules-data`, `@osg/sim`. The scope is confirmed.
- Packages are consumed **as TS source** through workspace `exports` that point at `src/index.ts`, so there's no build step in M0. `apps/sim` runs with `tsx`.
- Dev dependencies: `typescript ~5.8`, `vitest ^5` (matches Sybyl), `fast-check`, `tsx`. Runtime: `zod` (use the current major; Zod 4 if it's available).
- Root scripts: `"test": "pnpm -r test"`, `"typecheck": "pnpm -r exec tsc --noEmit"`, `"sim": "pnpm --filter @osg/sim start --"`.
- `.gitattributes`: `* text=auto eol=lf` (the repo is developed on Windows).

---

## 2. `packages/dice`

### 2.1 `Rng`

```ts
// types.ts
export interface Rng {
  readonly seed: string;
  readonly position: number;     // number of uint32 draws consumed so far
  nextUint32(): number;
  next(): number;                // [0, 1)
}
```

- Implementation: `sfc32` seeded from a `cyrb128` hash of the seed string. That's 32-bit integer math, so it's fast and has no BigInt. (PCG32 needs 64-bit state; it's fine but slower in JS. Either one meets the brief.)
- `createRng(seed: string, position = 0): Rng`. It advances `position` draws, so any roll can be reproduced from `(seed, position)`.
- `scriptedRng(faces: number[], sides = 6): Rng` is a **test helper** that returns the exact die faces given. It replaces Sybyl's `vi.spyOn(Math, "random")` mocks and drives the Appendix B replay.
- `d(sides, rng)`: `1 + Math.floor(rng.next() * sides)`.

### 2.2 Engine-facing helpers (`osg.ts`)

```ts
roll2d6Keep(keep: "high" | "low", rng): { dice: [number, number]; kept: number; doubles: boolean }
rollD6(rng): number
rollD66(rng): { tens: number; units: number; value: number }   // Solo App. C, Reading d66
```

### 2.3 Porting `diceEngine.ts`

Source: `../sybyl-standalone/app/src/lib/toolkit/diceEngine.ts` (631 lines) and its test (288 lines).

- Replace both `Math.random` calls (lines ~213 and ~227) with an `rng` parameter that threads through `rollDiceSpec(spec, expression, rng)` and `rollExpression(expr, rng)`.
- Tests: replace `vi.spyOn(Math, "random")` with `scriptedRng` or a fixed-value stub `Rng`. Port Sybyl's `test/random.ts` `queueDice` onto `scriptedRng`.
- **Drop for now:** the test that cross-checks with `../lonelog/diceNotation` `isDiceExpression`. It belongs in `packages/factionlog` (M4). Leave a `// TODO(M4)` comment pointing to it.
- The dice grammar isn't used by the engine in M0. It's ported now so that Sybyl can switch to this package (sharing decision).

**Checks:** the ported Sybyl tests pass; `createRng("x")` gives the same sequence on every run; `createRng("x", n)` equals a fresh rng advanced `n` draws; fast-check: every face is in `1..sides`.

---

## 3. `packages/rules-data`

Zod schemas in `src/schemas.ts`, JSON in `data/`, typed loaders in `src/index.ts`. All prose is copied **verbatim** from the qmd, because the drift test compares strings.

| File | Source | Shape |
| --- | --- | --- |
| `core.json` | Solo Part II, III; CG Part IV | result bands, the oracle odds table, the answer table |
| `behavior-rules.json` | Solo Part IV, Behavior Rules | `d6 → { id: "consolidator"…, name, rule }` |
| `disposition.json` | Solo Part V, Disposition | per-step offer, targeting and keeping-deals text, plus a machine field `keepOdds` |
| `offer-results.json` | Solo Part V, Making an Offer | answer → result text |
| `signals.json` | Solo Part V, Signals | `d6 ranges → { id, name, text }` |
| `secrets-generic.json` | Solo Part VI + App. C Popular | leverage type → 6 entries |
| `inspiration.json` | Solo Part VIII | `especiallyGood`, `especiallyBad`, `friction`, `forceOfNature`, 6 entries each |
| `aa-actions-generic.json` | Solo App. C.4 | leverage type → 6 entries; `[target]` kept as a literal token |
| `generator.json` | Solo App. C.1–C.6 | event / absence (d66 with category), stake, archetype (d66), secondary, stance, vulnerability, tie, escalation, location |
| `packs/corentine.json` | Solo App. A | the scenario pack (below) |

**Leverage type** is an open string, with the six standard ones as a suggested enum. Essaveth's secondary is `diplomatic`, and Solo Part IV allows "the scenario's own".

**Scenario pack schema** (`ScenarioPack`; `packages/rules-data/src/schemas.ts` is authoritative): `id, title, problem, world, map[{id, name, notes, contested}], turnZero[], unsettled[], clock{length, escalations[{box, title, text, breakingPoint}]}, variants[{id, turns, factions[], background[], standing[], recommended}], factions[{id, name, title, public, asPlayer{shortTerm, longTerm, position[], bonus{name, uses, text?}}, asAA{objective, position, leverage{primary, secondary?}, behavior, bonus?, actionTable[6], secretTable[6]}}], startingDisposition{[aaId]: {[playerFactionId]: Disposition}}`. Appendix A gives no explicit map connections (the location notes describe the routes), so the M0 schema has none.

**How the JSON was made:** extracted once from `solo_mode.qmd` @ `0d96334` by a throwaway script (cells kept verbatim, with `**`/`*` emphasis and trailing `\` removed), then given machine fields. From now on, edit the JSON by hand; the drift test (section 6) catches divergence from upstream.

**Licence (confirmed):** everything in `data/` is CC BY-SA 4.0 rules content; the code is MIT. Add `data/LICENSE` (CC BY-SA 4.0, with attribution to Open Strategy Games and the source file and commit) in the same commit as the first data file, and set the package's `license` field to `MIT AND CC-BY-SA-4.0`.

**Checks:** every JSON file parses with its schema; each table has exactly 6 rows (or 36 for d66 tables); every d66 key is in `11..66` with both digits `1..6`.

---

## 4. `packages/engine`

### 4.1 Module layout

```
src/
  types.ts         ids, enums, GameState, Event union, Command union, DecisionPoint union
  events.ts        event constructors + EventMeta
  fold.ts          fold(events) / applyEvent(state, event) — pure reducer
  turn.ts          step machine: nextRequired(state), assertAllowed(state, command)
  commands.ts      handle(state, command, rng) -> Event[] | EngineError
  rules/
    resolution.ts  CG IV / Solo II   band, keep, conflicts, bonus
    oracle.ts      Solo III          odds -> roll -> answer
    offers.ts      Solo V            odds ladder, Hostile/Allied cases, answer effects
    disposition.ts Solo V            scale, step deltas, clamp, once-per-cause
    deals.ts       Solo V            obligations, keep-check odds, break effects
    aa.ts          Solo IV           AA order, hold rule, target fill, veto, bonus use, adaptation triggers
    signals.ts     Solo V            d6 -> signal
    secrets.ts     Solo VI           uncover triggers, rumor/private/public, duplicates
    notice.ts      Solo VI           covert notice odds
    clock.ts       Solo VII          length, advance, push back, escalations
    inspiration.ts Solo VIII         roll a named table
    standing.ts    Solo IV           list ops (move up/down, reorder), self-target skip
  index.ts
```

The `rules/*` modules are **pure functions over plain values**, with no `GameState`. The command handlers in `commands.ts` read the state, call the rules, roll and emit events. This keeps each rule unit-testable from its table.

### 4.2 Core types

```ts
type FactionId = string; type FactId = string; type DealId = string; type ActionId = string;
type Grade = "strong" | "weak";
type Odds = "refused" | "unlikely" | "even" | "likely" | "accepted";
type OracleAnswer = "yes-and" | "yes" | "yes-but" | "no-but" | "no" | "no-and";
type Disposition = "hostile" | "wary" | "neutral" | "open" | "allied";
type Behavior = "consolidator" | "aggressor" | "opportunist" | "balancer" | "reactor" | "schemer";
type Band = 6 | "4-5" | "2-3" | 1;              // or "especially-good" | "success" | "worse" | "especially-bad"
type ActionClass = "unopposed" | "opposed" | "conflict" | "joint";
type Visibility = { kind: "public" } | { kind: "private"; faction: FactionId } | { kind: "player-only" };
type Author = "player" | "engine" | `llm:${string}`;
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface EventMeta { seq: number; turn: number; step: Step | 0; author: Author }
interface RollMeta { seed: string; position: number; faces: number[] }   // on every roll event
```

### 4.3 Events

Each event is `EventMeta & { type: ...; ... }`. **As built, `packages/engine/src/events.ts` is authoritative.** Differences from the first plan:

- **`OracleConsulted`** is one event holding the odds, the purpose and the roll: the command sets the odds, the engine rolls in the same command, and nothing can change the odds afterwards. Its `purpose` links rule-driven questions (offer, deal keep, joint confirm, grade by Oracle, notice).
- **`ActionDeclared` is the lock.** Declaring is committing (Part X, 3), so there is no separate `ActionLocked`.
- **No generic `DecisionAnswered`.** Each decision point has its own command and domain event (`LeverageGraded`, `ConflictJudged`, `ConsolidatorThreatAnswered`, `ClockEffectAnswered`, ...), which keeps the log readable and typed.
- Talk: `OfferMade` (with the computed odds and their steps), `OfferAnswered` (answer and follow-up), `OfferSettled`, `DealStruck`; deals: `DealKeepCostAnswered`, `DealKept`, `DealBroken`, `DealEnded`.
- Step 5: `ActionsClassified` → `ConflictJudged` / `LeverageGraded` → (engine) `DiceRolled`, `BonusSpent`, `ResultBanded` (the band after conflict resolution, with the outcome: unopposed, rolled, as-rolled, prevails, worse, standoff) → `InspirationAnswered`/`InspirationRolled`/`InspirationApplied`, `ForceOfNatureAnswered`/`ForceOfNatureRolled`, `ClockEffectAnswered`/`ClockMoved`/`EscalationLanded`, `SecretRolled`/`SecretsResolved`/`InvestigationSixAnswered`/`FactRevealed` → `OutcomeAccepted` (with its new facts).
- Classes are `unopposed | opposed | conflict`; a joint action is an action with several `participants`, classified like any other.
- **Deferred to M1:** elimination and new powers (`FactionEliminated`), Oracle interpretation text (`OracleInterpreted`), Turn Zero Oracle questions during setup.

`rngPosition` in the state is the position after the last roll event. Command handlers build `createRng(seed, state.rngPosition)`, so replaying commands is deterministic without storing Rng objects.

### 4.4 Decision points

As built: `nextRequired(state)` in `turn.ts` returns `{ decisions, auto, canAdvance }`. **Decisions** are what only the player can give (judgment and writing); each is answered by its own command (`execute(state, command)` in `commands.ts`), which checks that a matching decision is open. **Automatic tasks** are what the engine does as soon as nothing blocks it: every roll the rules call for (table rolls, deal keep checks, joint confirmations, the group rolls, Signals, notice checks), filling a target the rules decide, holds, deal expiry, the end-of-turn Clock, closing the turn. `execute` runs them after each command, so a command returns every event up to the next decision. Optional player actions (`askOracle`, `makeOffer`, `vetoEntry`, `breakDeal`, `changeObjective`, `confirmSecret`) are allowed in their steps without being required.

The decision kinds below are the planned ones; the built union is `Decision` in `turn.ts` (adds `declare`, `writeAAAction`, `writeOutcome`, `settleOffer`, `signalOffer`, `inspirationTarget`, `investigationSix`, `revealToAA`, `exposure`, `interested`, `report`, `startGame`, `openTurn`).

| Kind | Where | What it asks | Engine contribution |
| --- | --- | --- | --- |
| `offerFit` | step 2 | Does the deal advance its objective? Does it cost what its rule protects or help its rival? | computes the odds from the answers + disposition |
| `offerCondition` | step 2, Yes-but | Take the added condition or walk away | — |
| `offerNoAnd` | step 2, No-and | −1 disposition **or** leak (crumb) | applies the chosen effect |
| `dealKeepCost` | step 4 | Does keeping the deal cost the AA something real this turn? | odds from disposition. **Not asked for a Schemer**: it checks every turn (A1) |
| `consolidatorThreat` | step 4 | Was it threatened in the last Report (does it have something to defend)? | hold if no |
| `targetChoice` | step 4 | Which faction is most in the way? | supplies the candidates; auto-fills when the rule names a target or the disposition tie-break decides it |
| `veto` | step 4 | Does the rolled entry make no sense / break the rule? | one reroll, then `writeFromRule` |
| `classify` | step 5 | Classes and collision groups | — |
| `grade` | step 5 | Strong / Weak / ask the Oracle at Even | records the source; locks before the roll |
| `bothCanBeTrue` | step 5, conflict | Can both outcomes be true at once? | if yes, each is read as rolled |
| `inspiration` | step 5, on 6 / 1 | Apply "especially good/bad"? | rolls the table on yes |
| `forceOfNature` | step 5, doubles | Use one? (also shows how many have been used: once or twice per game) | rolls the source on yes |
| `clockEffect` | step 5 | Does this 1 / Force of Nature worsen the Problem? Does this 6 address the Problem? | ±1 box |
| `secretTrigger` | step 5 | Was this a successful investigation? Does the Exposure fit a secret? | rolls and bands per section 5.7 |
| `dispositionCauses` | step 7 | per AA: kept deal / clear benefit / harm | applies deltas, once per cause, clamped |
| `adaptation` | step 7 | which entry to rewrite, and the new text | trigger detection is engine-side |
| `standing` | step 7 | the new order | applies list effects from inspiration first, as a proposal |

### 4.5 Turn state machine (`turn.ts`)

`nextRequired(state): Requirement[]` returns what has to happen before the step can advance. A command that isn't allowed in the current step returns `EngineError{code: "out-of-order"}`.

| Step | Exit condition |
| --- | --- |
| 1 Take stock | always (no events required) |
| 2 Talk | every pending Offer is resolved or walked away from; Signal-offers from last turn are answered |
| 3 Declare | the player's `ActionDeclared` + `ActionLocked` exist (or the player joins a joint action); the bonus has uses left |
| 4 AA actions | each AA has `AAHeld` or `ActionAccepted` (or is in a joint action) |
| 5 Adjudicate | every action is classified; every opposed/conflict/joint action has a `LeverageGraded` **before** its `DiceRolled`; every result is banded; the inspiration / FoN / clock / secret points are answered; every action has `OutcomeAccepted` |
| 6 Signals | `SignalRolled` per active AA; `NoticeChecked` per covert player action |
| 7 Update | the disposition, adaptation and standing points are answered; `ClockAdvanced{reason:"turn"}` emitted; escalation landed if one was reached |
| 8 Report | `ReportPublished` → `TurnClosed` → the next `TurnOpened` (or game end after `turns`) |

Hard invariants, enforced in `assertAllowed`:
- After `ActionLocked`, no command may change that action.
- No `AATableRolled`, `DiceRolled` or AA `ActionAccepted` before the player's `ActionLocked` for the turn.
- `LeverageGraded` for an action is rejected once its `DiceRolled` exists.
- `OracleRolled` requires its `OracleAsked` (with odds) to be already committed.

Use a plain discriminated union. Switch to XState only if the step logic sprawls.

---

## 5. Rules, exactly

### 5.1 Resolution (CG IV, The Dice Mechanic; Solo II)

- `keepFor(grade)`: strong → high, weak → low.
- `band(kept)`: 6 → especially good; 4–5 → success; 2–3 → worse than desired; 1 → worse + especially bad.
- `doubles`: the two faces are equal. This only matters on adjudication rolls (not the Oracle).
- **Unopposed:** no roll; the desired outcome occurs.

### 5.2 Bonus (CG VII, Spending a bonus; Solo II)

Declared in Leverage, so it's known before grading.
- Graded **Weak** + bonus → treated as Strong (roll keeping high). `effect: "weak-to-strong"`.
- Graded **Strong** + bonus: kept 4 or 5 → effective 6 (`"4-5-to-6"`); kept 1–3 → unchanged, bonus still spent (`"no-effect"`); kept 6 → stays 6, bonus spent (`"no-effect"`, see A6).
- In conflict, an improved result counts as **6** for comparison.
- Uses are decremented on `BonusSpent`. Declaring a bonus with 0 uses left is rejected at step 3.
- AA bonus policy (Solo IV): an AA spends its bonus the first time it acts within the bonus's scope with Weak leverage, or in an action in conflict. Scope is judgment: `bonusInScope` is part of the `grade` decision for AAs.

### 5.3 Conflicts (CG IV, Actions in Conflict)

Input: the group's `{actionId, effective}[]` plus the `bothCanBeTrue` answer.
- If both can be true (two actions only) → each is read by its own band.
- Otherwise the max effective result prevails and is read normally. If the max is tied → **standoff** among the tied actions: all of them are "worse than desired". Everyone below the max → worse than desired, whatever their die showed; **a kept 1 still triggers "especially bad"**.
- Property tests: exactly one prevailing action or ≥2 in a standoff; a prevailing action has the max; no action is better than "worse" unless it prevails.

### 5.4 Oracle (Solo III)

- likely → 2d6 keep high; even → 1d6; unlikely → 2d6 keep low.
- 6 yes-and, 5 yes, 4 yes-but, 3 no-but, 2 no, 1 no-and. Doubles are ignored.
- `refused` / `accepted` don't roll (used by Offers and deal keeps).
- "Ask once": the engine stores questions and doesn't block a repeat. Duplicate detection is a UI concern (M1).

### 5.5 Offers (Solo V, Making an Offer; Disposition table)

Ladder index: refused 0, unlikely 1, even 2, likely 3, accepted 4. Start at **even**.
- `+1` if `fit.advancesObjective`; `+1` if the disposition is open or allied.
- `−1` if `fit.costsProtectedOrHelpsRival`; `−1` if the disposition is wary.
- Clamp to 0..4. ≥ accepted → accepts without a roll; ≤ refused → refuses without a roll.
- **Hostile:** refused, unless `advancesObjective`, in which case the odds are exactly **unlikely** (ignore other shifts; see A3).
- **Allied + advancesObjective:** accepted without a roll.
- Results: yes-and → accept plus the player picks one of {information, extra help, +1 disposition}; yes → accept; yes-but → `offerCondition`; no-but → refuse plus a counter-proposal text; no → refuse; no-and → `offerNoAnd` (−1 disposition or a leak crumb).
- One Offer per AA per turn (step 2). Signal-4 offers are answered at the next step 2; refusing an open or allied AA's Signal offer → −1 disposition.

Worked check (App. B): Meranto, neutral, advances objective → even +1 = **likely**. ✓

### 5.6 Disposition (Solo V)

- Scale: hostile, wary, neutral, open, allied (index 0..4); clamped.
- Starting value: set by the scenario (the Corentine matrix) or by the Briefs rule.
- End-of-turn causes (step 7, `dispositionCauses`): `+1` kept a deal **or** clear benefit; `−1` harmed it (even as a side effect) **or** it uncovered a covert action of yours aimed at it; `−2` you broke a deal with it. **Each cause at most once per turn.** Causes add up, then the result is clamped.
- Immediate effects (apply when they happen, as their own `DispositionChanged`): Offer yes-and (+1, if chosen), Offer no-and (−1, if chosen), refused Signal offer (−1), covert noticed (−1). See A4 for how these interact with "once per turn".
- Elimination → a new power starts at **wary**.

### 5.7 Deals (Solo V, Deals; Joint Actions with an AA)

- `obligations[]` per party: `{kind: "act", description}` or `{kind: "refrain", description}`.
- Step 4, per AA, in this order (Solo X.4): (1) an `act` obligation this turn → that is its action (no table). Keep check: a **Schemer** checks every turn it has an active deal (no `dealKeepCost` question); any other AA checks only if `dealKeepCost` says it costs something real. Odds from disposition: wary even, neutral likely, open likely, allied automatic (Schemer: likely), hostile unlikely (A9). On a no → `DealBroken{by: aa}`, and its action exploits the break (`targetChoice` with the deal partner suggested). (2) Hold rule. (3) Table roll; if a `refrain` obligation forbids the entry → reroll (this does **not** use the veto).
- Player breaks a deal → −2 disposition (the step 7 cause is pre-checked).
- Joint action with an AA: each turn, ask "Does [AA] confirm?" at likely (allied: automatic). On a no → the AA rolls its own table and the joint action's leverage is regraded.

### 5.8 AA actions (Solo IV)

**Hold rules:**

| Behavior | Holds when |
| --- | --- |
| Consolidator | `consolidatorThreat` answered "nothing to defend" |
| Aggressor | never; "never holds two turns running" → if it held last turn (by deal or forced), it must act |
| Opportunist, Balancer | never (they have targets) |
| Reactor | it was not acted upon last turn (any action last turn naming it as a target or affecting it: an engine-tracked `affectedBy` set from the accepted actions' targets, plus a `targetChoice`-style confirmation) |
| Schemer | the turn is even |

Holding emits `AAHeld` and an unopposed consolidation action (the player writes one line in M1; the sim uses a stub).

**Target fill (`[target]`):**
1. Opportunist → the lowest on Standing; Balancer → the highest; Reactor → the faction that last affected it.
2. Self-skip: if that is the AA itself, Opportunist takes the next one **up** from the bottom, Balancer the next one **down** from the top (A10).
3. Otherwise → "most in the way of its objective" = `targetChoice` (judgment). Before asking: if the disposition is **hostile** → the player, automatically ("picks you whenever its rule allows a choice"). The tie-break among equal candidates is resolved by the answer itself: wary → the player is preferred; open → the player is excluded; allied → never targets the player unless the rule forces it (also applies to step 1).
4. App. B check: Caldrath is an Aggressor and Hostile → target = Essaveth with no question. ✓

**Veto:** one reroll per AA per turn on a `veto` "yes". If the reroll is vetoed too → `writeFromRule` (the action is written by hand; there's no table entry).

**Adaptation triggers** (flagged in step 7): the AA's kept die was 6 or 1 on an adjudication roll; its objective was achieved; its objective became impossible (→ a new objective and `BehaviorRerolled` with d6 on the behavior table). One entry per trigger set (see A5).

**Elimination:** at the next turn's start, an Oracle "Does a new power rise?" at likely when relevant (`purpose: "new-power"`).

### 5.9 Signals and notice (Solo V, VI)

- Signal d6 per active AA: 1–2 silence, 3 warning, 4 offer, 5 exposure, 6 windfall.
- Covert player action: "Is it noticed?" at **unlikely**, or **even** if any AA has informational leverage (primary or secondary) **or** the action targeted an AA. On a yes → roll among the interested AAs (`Which faction?`: a uniform roll over the candidates) → −1 disposition, it now knows, and its next `[target]` is forced to the player.

### 5.10 Secrets (Solo VI)

- Triggers: a successful investigation (by band: 6 → two rolls, or one roll plus a crumb on another faction (a choice); 4–5 → private; 2–3 → rumor); the AA's own kept 1 on any adjudication → public; a fitting Exposure Signal → (a choice) a roll.
- Duplicates: reroll until the index isn't uncovered yet. If all 6 are uncovered → no secret.
- A rumor is confirmed by a second investigation or by "paying off in play" (`SecretConfirmed`, judgment).
- An AA investigating the player and succeeding: the player picks a private Position fact or a past covert action to reveal (a decision point; the fact's visibility gains that AA).

### 5.11 Crisis Clock (Solo VII)

- Length = `turns − 1` unless the scenario sets it (Corentine: 4 boxes for 6 turns).
- Escalations at the boxes the scenario names (generator: about 1/3, 2/3, and the last box = Breaking Point).
- `+1` at step 7 every turn; `+1` per `clockEffect` "worsens" (a 1's especially-bad entry 6, or a Force of Nature); `−1` per `clockEffect` "addresses" on a 6 (especially-good entry 6 also pushes it back).
- Clamped to `0..length`. When the position reaches or passes an escalation box not landed yet → `EscalationLanded` (it lands in this turn's Report). The Breaking Point doesn't end the game.

### 5.12 Inspiration (Solo VIII)

- Tables: especially good (on 6), especially bad (on 1), friction, Force of Nature source.
- Mechanical entries produce **proposals** that the player confirms through the related decision points: good 2 → a secret roll; good 4 / bad 4 → a Standing move (applied as the default proposal in `standing`); good 5 / bad 2 → ±1 disposition (an AA actor reads it as disposition toward the faction it acted on, if that's the player); good 6 / bad 6 → clock ∓1; bad 3 → lose an asset (a bonus use, if chosen).

---

## 6. Drift test (`packages/rules-data/test/drift.test.ts`)

- Read `rules/osg/docs/solo_mode.qmd` (skip with a clear message if the submodule is missing locally; **fail** in CI, using `process.env.CI`).
- A tiny Markdown pipe-table parser: heading path → table rows (strip `**`, `*`, trailing `\`). Tables are found by their heading path, e.g. `Part VIII > Friction`, `Appendix A > The Kingdom of Caldrath` (2nd table after `As an AA`).
- Compare the JSON prose with the cells, cell by cell, after normalizing whitespace and dashes. A mismatch message lists the heading, the row and both strings.
- **Check:** `drift(text)` is a pure function over the qmd text, so the meta-tests edit the text in memory (one Friction cell, an added row, a renamed heading, changed prose) and expect the matching mismatch. Built: `packages/rules-data/test/{qmd,drift,drift.test}.ts`.

---

## 7. Replay test: Solo App. B (`packages/engine/test/appendix-b.test.ts`)

The fixture follows App. B at upstream `0d96334`. Drive **commands** (not raw events) on the Corentine pack, variant `lighter`, player Essaveth, 6 turns, with `scriptedRng` faces in this order:

| Roll | Faces | Expect |
| --- | --- | --- |
| Offer to Meranto, odds likely | 2, 4 | kept 4 → yes-but → condition accepted → `DealStruck` |
| Caldrath table | 3 | "Demand right of passage from [target], backed by the army" → target Essaveth (hostile, automatic) |
| Meranto keeps the deal? (Schemer, neutral → likely) | 5, 3 | kept 5 → yes → the `act` obligation is its action, no table roll |
| Essaveth, Strong + Pass Wardens | 3, 5 | kept 5 → bonus 4-5-to-6 → effective 6; Pass Wardens 2 → 1 |
| Caldrath, Strong | 4, 4 | kept 4, doubles → FoN declined |
| Conflict | — | Essaveth prevails 6 vs 4; Caldrath worse than desired |
| Especially good (Essaveth) | 4 | "Weakens a rival" → Standing proposal moves Caldrath down one |
| Meranto | — | unopposed → success |
| Signal Caldrath | 3 | warning |
| Signal Meranto | 5 | exposure |

Decision answers: grades strong/strong; classify {conflict: Essaveth+Caldrath, unopposed: Meranto}; bothCanBeTrue no; inspiration yes on Essaveth's 6; clockEffect none; dispositionCauses Meranto: kept deal (+1), Caldrath: harmed (−1); standing confirmed.

**Assert after `TurnClosed`:** Standing = Meranto, Caldrath, Essaveth; Meranto open, Caldrath hostile (clamped from −1); deal Essaveth/Meranto active since turn 1; Clock 1/4, no escalation landed; Pass Wardens uses = 1; the scripted rng is fully consumed; `fold(events)` equals the state built step by step; replaying the event log alone (no commands) gives an identical state.

Also: `scripted-turn.test.ts` tries every out-of-order command once and expects `out-of-order`.

---

## 8. `apps/sim`

`pnpm sim -- --games 1000 --seed 42 --pack corentine --variant lighter --as essaveth --turns 6 [--policy default]`

- Policies answer every decision point: grades (the player 50/50, AAs 50/50, configurable), classify (pairs any actions that share a target into a conflict; everything else is unopposed), offers (one per AA per turn when the fit is positive at random), the rest default to the conservative choice (decline FoN, no clock effect, Standing = the inspiration proposal, otherwise unchanged).
- Output (stdout, plus `--json`): band distribution per grade, conflict win/standoff rates (compare with CG IV's stated 77% / 11%), offers accepted, deals broken, clock-at-breaking-point rate, the average turn the Breaking Point is reached, the disposition distribution at the end.
- **Checks:** two runs with the same seed print identical output; the Strong-vs-Weak conflict rates are within ±2% of 77/11 over 100k rolls (a statistical sanity test, marked slow).

---

## 9. Work order and commits

| # | Step | Done when |
| --- | --- | --- |
| 1 | Workspace scaffold, CI, submodule @ `0d96334`, `.gitattributes` | CI green on an empty package |
| 2 | `@osg/dice`: Rng, sfc32, scriptedRng, OSG helpers, ported diceEngine + tests | section 2 checks |
| 3 | `@osg/rules-data`: schemas + all JSON + loaders | section 3 checks |
| 4 | Drift test | section 6 checks, including the meta-test |
| 5 | Engine `types.ts`, `events.ts`, `fold.ts` (setup + turn events only) | load the Corentine pack → state matches the pack |
| 6 | `rules/*` modules with unit and property tests | every table row in section 5 has a test; fast-check: the bonus never lowers a result, disposition stays in range, the conflict invariants hold, the oracle is monotone in odds |
| 7 | `commands.ts` + `turn.ts` + decision points | out-of-order tests pass; a scripted turn reaches `TurnClosed` |
| 8 | Appendix B replay test | section 7 assertions |
| 9 | `apps/sim` | section 8 checks |
| 10 | Update `CLAUDE.md` commands with the real scripts and package names | — |

---

## Appendix: rule ambiguities to settle (upstream or by decision)

None of these block the code: each is isolated behind a flag or a decision point. List them in an upstream issue.

- **A1. Schemer deal checks. Resolved upstream in `0d96334`.** A Schemer asks "Does it keep the deal?" every turn it has an active deal, even one that costs nothing; the odds come from its disposition. Appendix B now runs this check for Meranto (Likely, [5,3] → Yes). No flag needed.
- **A2. Aggressor "never holds two turns running".** The Aggressor has no hold condition of its own, so this only bites if it was forced to hold (by a deal refrain obligation, or a vetoed reroll). Engine: when forced, it acts anyway on the second turn.
- **A3. Hostile Offer odds.** "Refuses unless the deal serves its objective; then Unlikely". The engine treats that as fixed (other shifts are ignored). Alternative reading: start at unlikely and apply the shifts.
- **A4. "Apply each cause once per turn"** for immediate disposition effects (Offer yes-and/no-and, a refused Signal offer, covert noticed). Engine: the immediate effects are separate causes that aren't deduped against the step 7 causes. Covert noticed and "uncovered a covert action" at step 7 are the **same** cause, so they're deduped.
- **A5. Adaptation with several triggers** in one turn (for example, a 6 and an objective achieved): one rewrite per trigger, or one per turn? Engine: one per trigger.
- **A6. A bonus on Strong with a kept 6.** The rules only cover 4–5 and 1–3. Engine: no improvement, the bonus is spent. Does a player even have to spend it if it's declared? Yes, it's declared at step 3 and locked.
- **A7. "Both outcomes can be true"** with 3+ colliding actions: the rules only define the either/or case for 3+. Engine: `bothCanBeTrue` is offered only for two-action conflicts.
- **A8. Standing moves from the inspiration tables vs. the step 7 Standing revision.** App. B shows the move folded into the step 7 order. The engine treats inspiration moves as the default proposal for the `standing` point, not as a separate immediate change.
- **A9. A Hostile AA's deal-keeping odds.** The Disposition table says "n/a" under Keeping deals for Hostile, but a Hostile AA can hold a deal: it accepts an Offer that serves its objective at Unlikely odds, or a deal partner's disposition drops to Hostile while the deal runs. Engine: Unlikely, one step below Wary (`keepOdds` in `rules/disposition.ts`). Upstream fix: give Hostile a value in the table.
- **A10. Self-skip direction for Opportunist and Balancer.** Part IV: "If its rule points at itself, take the next faction down (Opportunist) or up (Balancer) the list." An Opportunist points at itself only when it is lowest, so there is nothing further down; read literally, the directions are inverted. Engine: the next faction in from that end (Opportunist: second lowest; Balancer: second highest). Upstream fix: "up (Opportunist) or down (Balancer)".
- **A11. A bonus declared on an action that turns out unopposed.** The bonus rules (CG Part VII) cover Weak and Strong grades; an unopposed action is neither graded nor rolled. Engine: the bonus is not spent. Upstream fix: say so, or say it is spent.
- **A12. One-off deal obligations.** Part V says an obligation to act "replaces the table", but not for how long. Appendix B's "delay Caldrath's next war-loan payment by a month" is a one-time act, yet the deal stays active. Engine: an obligation may name the `turn` it binds; without one it binds every turn the deal is active. Upstream fix: a line on obligations that are done once.
