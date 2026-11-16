# Implementation Plan

Derived from `Freeform Strategy App Architecture and Stack (OSG Solo).md`. M0 follows the brief in that doc. The doc's roadmap is an embedded diagram whose text did not export, so the scope of M2 to M4 is inferred from its sections ("M1 is a complete game without any LLM", "each LLM role then arrives behind a toggle"). Check them against the original roadmap.

Every milestone ends with a **gate**. Don't start the next milestone until the gate passes.

---

## M0: Engine, no UI, no LLM

Goal: a deterministic rules engine that can replay Solo Mode Appendix B and run thousands of simulated games.

**Detailed spec: `docs/phase-1-engine.md`** (exact rules, types, events, decision points, test fixtures, rule ambiguities). Where the summary below and the spec differ, the spec wins.

Work order (each step depends on the one before it):

1. **Scaffold.** Root `package.json` and `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), Vitest workspace config. `git submodule add https://github.com/openstrategygames/openstrategygames.github.io rules/osg`, then check out `0d96334`. GitHub Actions: checkout with `submodules: true`, `pnpm -r exec tsc --noEmit`, `pnpm -r test`. Node 22 (matches Sybyl).
   - Check: CI green on an empty package.
2. **`packages/dice`.** Copy `../sybyl-standalone/app/src/lib/toolkit/diceEngine.ts` and its test. Add `Rng` (`types.ts`: `interface Rng { next(): number; position: number; seed: string }`) with a seedable PCG32, plus `fork`/`at(position)` so a roll can be reproduced from its event. Replace every `Math.random`. Add helpers the engine needs: `d6`, `roll2d6Keep("high" | "low")`, `d66`.
   - Check: Sybyl's tests pass; the same seed gives the same rolls; a roll replays from `(seed, position)`.
3. **`packages/engine`: events and the reducer.** `types.ts` with the event union (every event carries `turn`, `step`, `author: "player" | "engine" | \`llm:${string}\``, and roll events carry `seed`/`position`). `fold(events) -> GameState`. Projections: Scenario, Faction, AA profile, Fact (with visibility), Thread, Deal, Action, Adjudication, Clock, Report.
   - Check: the reducer is pure; folding any prefix of a log yields a valid state.
4. **`packages/engine`: deterministic rules**, one module per source part, each function citing its source:
   - `resolution.ts` (CG Part IV): Strong/Weak keep, bands 6 / 4-5 / 2-3 / 1, doubles, conflicts (highest kept die wins, tie = standoff, 3+ actions), bonus rules.
   - `oracle.ts` (Solo III): Likely / Even / Unlikely, mapping 6..1 to the six answers.
   - `offers.ts`, `disposition.ts` (Solo V): odds ladder, shifts, the Hostile/Allied cases; five-step disposition, once-per-turn causes, clamping.
   - `aa.ts` (Solo IV): deal obligation, then hold rule, then table roll; `[target]` fill; one veto reroll; Adaptation triggers.
   - `signals.ts`, `secrets.ts` (Solo V, VI): Signal d6, covert notice, Secret uncovering bands.
   - `clock.ts` (Solo VII): length = turns - 1 by default; +1 per turn, +1 on a bad result or a Force of Nature, -1 on a 6 that addresses the Problem.
   - `inspiration.ts` (Solo VIII): table rolls only; the content comes from rules-data.
   - Check: unit tests per rule, including every bonus and conflict edge case; fast-check properties (for example, a bonus never lowers a result, and disposition stays in range).
5. **Turn state machine** (`turn.ts`). Eight steps as states; decision points as typed pending states (`{ kind: "gradeLeverage", actionId } | ...`). `nextRequired(state)` tells the caller what event is needed. Enforce the action lock at step 3 and grades-before-roll in step 5. Use a plain discriminated union unless it gets unwieldy; XState v5 is the documented alternative.
   - Check: a scripted turn reaches `TurnClosed` only after all required events; out-of-order events are rejected with a typed error.
6. **`packages/rules-data`.** Zod schemas plus JSON: Inspiration tables, behavior rules, generic AA Action tables and Secret tables (Appendix C.4), the d66 generator tables (Appendix C), and the Corentine Succession pack (Appendix A).
   - Check: every JSON file validates in tests.
7. **Drift test.** Parse the Markdown pipe tables in `rules/osg/docs/solo_mode.qmd` by heading and compare them with the rules-data JSON.
   - Check: editing a table cell upstream (in a temporary copy) fails the test.
8. **Replay test.** Encode Appendix B (Essaveth, Turn 1) as a fixed event script against the Corentine pack.
   - Check: the replay yields the appendix's Standing, dispositions, deal and Clock.
9. **`apps/sim`.** Node CLI: N games, decision points answered by simple policies (random grade, fixed Standing, accept every deal, and so on), with outcome rates, Clock-out rate and turn counts.
   - Check: output is deterministic for a given seed.

**Gate M0:** all checks above pass in CI.

---

## M1: A complete solo game by hand (desktop, no LLM)

Goal: play the Corentine scenario start to finish with no API key. This build stays the fallback forever.

- `apps/desktop`: copy and rename Sybyl's `src-tauri/`, release workflows and `docs/BUILDING.md`; add the Tauri SQL plugin. React 19 + Vite + Zustand; reuse Sybyl's components (CommandPalette, SettingsModal, ConfirmModal, ListPickerModal, SideDrawer, StatusToast), `App.css` tokens and lucide icons.
- Storage: one SQLite file per campaign (an events table plus a projection cache rebuilt from the log). Put it behind a `CampaignStore` interface so the JSONL alternative stays a small swap.
- Screens: campaign list, scenario setup (pick a pack, Turn Zero), one screen per turn step, decision-point dialogs, a fact registry browser (with a visibility filter), a Standing/Deals/Clock dashboard, the Report editor (CodeMirror 6), an event log viewer with undo (truncate the log, then refold).
- Debrief screen (Solo Part XI), with per-faction grade rates already tracked.

**Gate M1:** a full Corentine game is played by hand in `tauri dev`; closing and reopening the app at any step restores the same state; undo works across a turn boundary.

---

## M2: LLM transport and the first roles

- `packages/llm-providers`: extract Sybyl's `providers/*`, `stream.ts` and `usage.ts` with their tests. Add `generateObject(schema)`: Anthropic tool use, OpenAI `json_schema`, Gemini `responseSchema`, Ollama `format`. Settle the sharing decision with Sybyl first (see below).
- Keychain: Sybyl's `keychain.ts` plus the Rust `keyring` commands, with a new service name.
- `packages/prompts`: versioned Markdown templates. The prompt version is stored in provenance.
- The LLM framework in the engine's host layer (not in `packages/engine`): context builder (visibility filter, then tags, then recency, inside a per-role token budget), schema validation, engine checks, one retry with the error text, then manual fallback. Provenance (role, prompt version, provider, model, input fact ids) is stored on each draft event.
- First roles behind per-role toggles: **AA Player** (step 4 expansions), **Oracle Interpreter**, **Offer voice** (step 2).
- Settings: per-role provider/model mapping.

**Gate M2:** a game is played with these three roles on; with any role off, play falls back cleanly; a forced invalid output goes to retry and then manual entry; no role's prompt contains a fact it can't see (tested).

---

## M3: Referee, Narrator, Reporter

- **Referee** (blind): relabel factions, shuffle actions, classify collisions, grade with a three-item checklist and cited facts. "Dispute" asks the Oracle at Even.
- **Narrator**: batched outcome drafts after the dice, with friction, a hook, a RAT self-check, new facts and crumbs (the private truth linked to its public crumb).
- **Reporter**: a news-roundup Report draft, streamed into the editor.
- Standing proposal (step 7) and Adaptation rewrites.
- Debrief metrics: Strong-grade rate per faction (to catch style leak), draft acceptance and edit rates.

**Gate M3:** blind-grading test (the player's faction id never appears in a Referee prompt); a citation to an unknown or invisible fact is rejected; a full LLM-assisted game stays within about 12 to 18 calls per turn with 3 AAs.

---

## M4: Factionlog, scenario builder, release

- `packages/factionlog`: a Factionlog 0.3 codec on Sybyl's Lonelog 1.7 parser (`@(A+B)`, `d: Strong 2d6kh1[5,3]=5 -> Success`, `[Fac:]`, `[Bon:Owner|...]`, `[Rival:]`, `[Deal:]`, `[Standing:]`, `[Clock:]`). Export from the event log; import 0.2 logs through Appendix A.
- **Scenario Builder** role over the Appendix C d66 procedure, with the "Check it" step as a validator. Fully manual generation works without the LLM.
- Release pipeline: signed desktop builds.

**Gate M4:** export then re-import a played game and get the same Standing, deals and Clock; a generated scenario passes the check and is playable.

---

## Later: group play

A Node or Bun server with Hono, a Postgres event store and the same engine package, with server-side visibility filtering and private submission. Out of scope until the solo release ships, unless the open decision below says otherwise.

---

## Open decisions (from the architecture doc)

**Settled (2026-11-16):** licence is MIT for the code and CC BY-SA 4.0 for the bundled rules data and scenario packs; package scope is `@osg/*`; the Schemer deal-check conflict was fixed upstream in `0d96334` (Appendix B now runs the check).

| Decision | Needed by | Recommendation |
| --- | --- | --- |
| Share `dice` / `llm-providers` / Lonelog parser with Sybyl: npm or one workspace? | M2 (before Sybyl imports anything) | Proceed in M0 with workspace packages here; publish to npm once the APIs settle, then Sybyl switches to the published packages |
| Desktop (Tauri) first vs web PWA first | M1 | Tauri; the engine is already portable |
| Campaign file: SQLite vs JSONL | M1 | SQLite behind `CampaignStore` |
| LLM on by default or opt-in per role | M2 | Opt-in per role until the M3 metrics exist |
| Group play in 1.0? | After M4 | No |

Also: the repo name (`umpire-standalone`, while the doc's layout calls the root `osg-app`).
