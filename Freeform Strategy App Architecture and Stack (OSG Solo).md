# Freeform Strategy App: Architecture and Stack (OSG Solo)

Nov 16, 2026 · @Roberto Bisceglie

## Purpose and scope

The app is a referee's desk for freeform Open Strategy Games: the player writes, the engine keeps state and rolls dice, and an LLM drafts the work a human referee or rival player would do.

- **Rules base:** Contested Ground 1.0 and Contested Ground: Solo Mode 1.0. The OSG Handbook is the design reference.
- **Release 1:** solo play. One human Actor, 2 to 4 Autonomous Actors (AAs), 4 to 8 turns.
- **Later:** async group play with a human Referee, built on the same engine. Breaking Point is out of scope.
- **Outputs:** a playable session, a Factionlog record, and the closing frame and debrief.

The LLM is optional by design. Every step must also work by hand, so the app stays usable offline, with no API key, and with a local model.

## Design principles

The rule that decides most trade-offs: **the engine owns state and dice, the LLM proposes, the player confirms.**

1. **Dice are never the LLM's.** Every roll (adjudication, Oracle, tables, Signals, Secrets) is a seeded engine roll, logged as an event. The LLM may read a result. It never chooses one.
2. **Commit before you know, enforced.** After step 3 the player's action is locked. No AA action, roll or LLM output for the turn exists before the lock.
3. **Odds before the roll, enforced.** The Oracle and leverage grades must be set before the engine rolls. A grade cannot change after its roll.
4. **Every LLM output is a draft.** It is shown, editable and accepted or rejected by the player. Only accepted text becomes established fiction.
5. **Traceability is data.** Established fiction lives in a fact registry. LLM grades and outcomes must cite fact ids, so RAT's Traceable test becomes a check, not a feeling.
6. **Same rules for every faction.** The grading checklist, prompts and validators are the same for the player and the AAs.
7. **Local-first.** The game file belongs to the player. Sync and group play are added on top, not required.

## Where the LLM helps

The LLM fills the two seats solo play lacks: the rival players and the Referee. It solves the three weak points of solo play: the writing load of AA actions, self-bias in grading, and subjective Standing.

| Task | Rule source | LLM drafts | Player decides |
| --- | --- | --- | --- |
| Expand an AA table entry into Action / Outcome / Leverage | Solo Part IV | A full action, written to win, using that AA's facts only | Accept, edit, or reroll once (Veto) |
| Grade leverage, Strong or Weak | Solo Part III | A grade, the three checklist answers, cited fact ids | Accept, or ask the Oracle at Even |
| Classify the turn: unopposed, opposed, conflict, joint | Contested Ground Part IV | Which actions collide and why | Confirm the pairing |
| Interpret a result (dice already rolled) | Core table, Inspiration tables | The outcome text with friction and a hook; a RAT self-check | Accept or edit |
| Interpret an Oracle answer | Solo Part III | One or two readings of the rolled answer | Pick one, or write one |
| Speak for an AA in an Offer | Solo Part V | The AA's reply in character, from its rolled answer | Accept or walk away |
| Propose Standing | Solo Part IV | A new order, one reason per move, from public facts only | Reorder |
| Draft the Report | Contested Ground Part V | Header, one paragraph per action, crumbs, closing line | Edit, then publish |
| Generate a scenario | Solo Appendix C | Sentences and customized table entries from the d66 rolls | Edit, run the check |

**Blind grading.** The grading call never knows which faction is the player's. Factions are relabeled (Faction A, B, C) and actions are shuffled. This is the main defence against an LLM that favors the user.

**The LLM never:** rolls or picks a die result; writes the player's action or tells the player what to do; changes a grade after its roll; decides which Secret is true (only the Secret Table roll does); writes to the fact registry without the player's acceptance; reads an AA's private Secrets when it writes for another faction.

## System architecture

&#91;embedded content: system architecture · 10 components\]

The player's commands go through the turn controller to the rules engine, which writes every event. The LLM side reads filtered facts and returns drafts that pass the validator and come back to the player for review. Only accepted drafts become events.

## Data model

The game is an append-only **event log**; every screen and every LLM context is a projection of it. This gives undo, replay, audit of every roll, a Factionlog export for free, and a direct path to group play.

**Events (examples).** `ScenarioCreated`, `TurnOpened`, `OfferMade`, `OracleAsked`, `OracleRolled`, `ActionDeclared`, `ActionLocked`, `AATableRolled`, `ActionDrafted` (LLM), `ActionAccepted`, `LeverageGraded`, `DiceRolled`, `OutcomeAccepted`, `FactEstablished`, `SecretUncovered`, `SignalRolled`, `DispositionChanged`, `DealStruck`, `DealBroken`, `ClockAdvanced`, `StandingSet`, `ReportPublished`, `TurnClosed`. Each event carries turn, step, author (`player`, `engine`, `llm:<role>`) and, for rolls, the RNG seed and position.

**Projected entities.**

| Entity | Key fields |
| --- | --- |
| Scenario | problem, world, turn count, map (locations, connections), Turn Zero answers, unsettled list |
| Faction | kind (player, AA, background), brief, objectives, position bullets, leverage types, bonuses with uses left |
| AA profile | behavior rule, disposition, Action Table (6), Secret Table (6, uncovered entry or none), rewrite history |
| Fact | id, text, turn, source event, visibility, tags (factions, locations, threads), status (established, rumor) |
| Thread | id, text, opened turn, closed turn, related facts |
| Deal | parties, terms, since, until, obligations, state (active, kept, broken) |
| Action | faction, turn, action, outcome, leverage, bonus, cited fact ids, class (unopposed, opposed, conflict, joint) |
| Adjudication | grade, dice, kept die, result band, doubles, inspiration rolls, outcome text, RAT check |
| Clock | length, position, escalations, breaking point |
| Report | header, paragraphs, crumbs, closing line, published facts |

**The fact registry is the core.** A fact has a **visibility**: public, private to one faction, or player-only. Visibility controls what each LLM call can see, and later what each human player can see. A private outcome produces two facts: the private truth and its public crumb, linked.

## Turn pipeline

Each Solo Mode step is one screen and one state of a turn state machine. The step cannot advance until its required events exist.

| Step | Engine | LLM drafts | Player |
| --- | --- | --- | --- |
| 1. Take stock | Shows last Report, Standing, Deals, Clock, open threads | Optional: a 3-line situation brief | Reads |
| 2. Talk | Computes Offer odds from disposition and shifts; rolls the Oracle | The AA reply in character; deal terms as structured fields | Writes Offers; accepts or walks away |
| 3. Declare | Validates format (one action, bonus available); **locks** | Optional: format lint only ("this reads as two actions") | Writes and commits |
| 4. AA actions | Applies deal obligation, then hold rule, then rolls the table; fills \[target\] from Standing and disposition | Expands each entry to Action / Outcome / Leverage | Accepts, edits, or vetoes once |
| 5. Adjudicate | Rolls 2d6, keeps high or low, compares conflicts, applies bonuses, rolls Inspiration tables and Secrets | Classifies collisions; grades blind with citations; writes outcomes with friction | Confirms classes and grades before the roll; accepts outcomes |
| 6. Signals and notice | Rolls a Signal per AA; rolls notice for covert actions | Writes each Signal as a line of fiction | Accepts |
| 7. Update | Applies disposition rules, deal states, Adaptation triggers, Clock advance | Rewrites an adapted table entry; proposes Standing | Confirms Standing and rewrites |
| 8. Report | Assembles accepted outcomes, crumbs, Clock line; publishes facts | Drafts the Report in news-roundup style | Edits and publishes |

**Order inside step 5 matters.** Classification and grades are confirmed first and stored as events. Only then does the engine roll. The outcome draft is the last call, after the dice.

## LLM layer design

The LLM layer is a set of narrow **roles**, each with its own prompt, its own visible facts and a typed output. No role has the whole game in view unless its job needs it.

| Role | Sees | Returns (schema) |
| --- | --- | --- |
| AA Player (one per AA) | Its brief, its private facts, public facts, the rolled entry, deals it is in | `{action, outcome, leverage, citedFacts[], bonus?}` |
| Referee | Public facts, private facts of the factions involved; factions anonymized | `{class, collisions[], grades[{faction, grade, checklist[3], citedFacts[]}]}` |
| Narrator | Everything, plus the dice results | `{outcomes[{faction, text, friction, hook, rat{r,a,t}, newFacts[], crumbs[]}]}` |
| Reporter | Accepted outcomes, crumbs, Clock, threads | `{header, paragraphs[], closing, newThreads[]}` |
| Oracle Interpreter | Question, odds, rolled answer, related facts | `{readings[1..2]}` |
| Scenario Builder | d66 rolls, genre note | Problem, briefs, customized tables, Clock |

**Context builder.** It selects facts by tag (factions, locations and threads named in the call), then by recency, inside a token budget per role. A short scenario summary and the last turn header are always included. Visibility is filtered before selection, so a role can never see a fact it should not.

**Validation.** Every output is parsed against its schema (Zod). The engine then checks it: cited fact ids exist and are visible to that role; a grade is Strong or Weak; a Strong grade has three checklist answers with citations; an action names one course of conduct. On failure: one retry with the error text, then a manual fallback. The game never blocks on the LLM.

**Provenance.** Each LLM event stores the role, prompt version, provider, model and input fact ids. A session can be audited, and prompts can be improved against real logs.

**Providers.** One interface over Anthropic, OpenAI, Gemini and Ollama, as in Sybyl. Roles can map to different models: a strong model for Referee and Narrator, a cheap or local one for Oracle readings and Signals.

**Load per turn.** With 3 AAs, a turn is about 12 to 18 calls: 3 expansions, 1 classification, up to 4 grades, 1 to 2 outcome batches, 1 Signals batch, 1 Standing, 1 Report, 0 to 3 Offers. Batching outcomes and Signals per turn keeps this down.

## Technology stack

The stack reuses the Sybyl standalone choices (Tauri, React, four LLM providers), so code and habits carry over. Everything outside the shell is plain TypeScript, so a web build and a server stay possible.

| Layer | Choice | Why | Alternative |
| --- | --- | --- | --- |
| Rules source | Git submodule of `openstrategygames/openstrategygames.github.io` at `rules/osg`, pinned to a commit | One upstream copy of the rules; every rules change is a visible submodule bump | A sync script that downloads `docs/*.qmd` |
| Repo | pnpm workspace, TypeScript strict | One language from engine to UI; shared types | Nx, Turborepo on top if builds grow |
| Rules engine | New pure TS package, no IO; event reducer; all randomness through an injected `Rng` | Deterministic, testable, runs in app, server and simulator | XState v5 for the turn state machine |
| Dice | `diceEngine.ts` from sybyl-standalone, changed to take an `Rng` | Full dice grammar, already tested; only `Math.random` must go | Write a 2d6-only roller |
| Rules data | JSON tables validated with Zod (Inspiration, behavior rules, generic AA and Secret tables, d66 generator, scenario packs), checked against `solo_mode.qmd` by a test | Tables are content; edit without code changes; drift from upstream is caught | Generate the JSON from the qmd tables at build time |
| LLM transport | Shared provider package extracted from sybyl-standalone `app/src/lib/providers` (Anthropic, OpenAI, Gemini, Ollama), plus a new `generateObject()` for structured output | Already handles streaming, cancel, usage, prompt caching, Tauri CORS and model quirks; one codebase for Sybyl and this app | Vercel AI SDK |
| Prompts | Versioned Markdown templates; wording ideas from Umpire `src/promptBuilder.ts` | Readable, diffable, tied to provenance | A prompt registry later |
| Desktop shell | Tauri 2, shell and keychain commands from sybyl-standalone | Small, multiplatform, release pipeline already works | Electron |
| UI | React 19 + Vite, Zustand for UI state, Sybyl's components and `App.css` tokens, lucide icons | Same curated look as Sybyl | Tailwind; shadcn/ui |
| Text editing | CodeMirror 6, with Sybyl's `Editor.tsx` and `liveOutput.ts` patterns | Factionlog highlight; streaming Report drafts | TipTap |
| Storage | One SQLite file per campaign (events + projection cache) via the Tauri SQL plugin | "One file = one campaign"; the log replays the game, so no snapshots | JSONL event file + in-memory projection |
| Secrets | API keys in the OS keychain (Rust `keyring` crate, as in Sybyl) | Never in the campaign file | Encrypted local store |
| Factionlog | Codec for Factionlog 0.3 built on Sybyl's Lonelog 1.7 parser and tag rules | Export and import only; the event log stays the source of truth; 0.2 logs read through Appendix A |  |
| Tests | Vitest, fast-check property tests, a Monte Carlo harness on the engine | Rules regressions and balance checks |  |
| Group play (later) | Node or Bun server with Hono, Postgres event store, the same engine package | Server-side visibility filtering and private submission | Supabase |

## Salvage from existing repos

The rules and the Factionlog spec come straight from the [openstrategygames.github.io](https://github.com/openstrategygames/openstrategygames.github.io/tree/main/docs) repo. Sybyl gives the infrastructure and a Lonelog 1.7 parser to build the Factionlog codec on. Umpire is deprecated and gives only prompt ideas. The rules engine, event store, fact registry, blind grading and turn screens are new code.

| Source | Path | Action | Notes |
| --- | --- | --- | --- |
| [openstrategygames.github.io](https://github.com/openstrategygames/openstrategygames.github.io/tree/main/docs) | `docs/contested_ground.qmd`, `docs/solo_mode.qmd`, `docs/osg_handbook.qmd`, `docs/factionlog.qmd` | Git submodule at `rules/osg`, pinned | The only copy of the rules the app uses; never edited in the app repo |
| [sybyl-standalone](https://github.com/zeruhur/sybyl-standalone) | `app/src/lib/providers/*`, `stream.ts`, `usage.ts` | Extract to `packages/llm-providers` | Keep tests. Add `generateObject()`: Anthropic tool use, OpenAI `json_schema`, Gemini `responseSchema`, Ollama `format` |
| sybyl-standalone | `app/src/lib/lonelog/tags.ts`, `beats.ts`, `parser.ts`, `formatter.ts`, `app/src/lib/lonelogHighlight.ts` | Adapt to `packages/factionlog` | Factionlog 0.3 is built on Lonelog 1.7, which this code already parses; add the Factionlog parts (`@(A+B)`, `d: Strong ...`, `[Fac:]`, `[Bon:Owner\|...]`, `[Rival:]`, `[Deal:]`, `[Standing:]`) |
| sybyl-standalone | `app/src/lib/keychain.ts`, `app/src-tauri/src/lib.rs` keyring commands | Copy | Keep the Android fallback; change the service name |
| sybyl-standalone | `app/src-tauri/*`, `.github/workflows/*`, `docs/BUILDING.md` | Copy and rename | Add the Tauri SQL plugin |
| sybyl-standalone | `app/src/lib/toolkit/diceEngine.ts` (+ test) | Extract to `packages/dice` | Replace `Math.random` with an injected `Rng` |
| sybyl-standalone | `app/src/lib/toolkit/tables.ts` `parseTableEntries`, `rollTable` | Adapt | Same `Rng` change; drop the vault folder reader |
| sybyl-standalone | `app/src/components/` (CommandPalette, SettingsModal, ConfirmModal, ListPickerModal, SideDrawer, StatusToast, useDismiss), `App.css`, `Editor.tsx`, `liveOutput.ts` | Reuse | Do not port `App.tsx`; keep its generation pipeline, abort and `stillActive()` patterns |
| sybyl-standalone | `settings.ts` `normalizeSettings` | Reuse pattern |  |
| sybyl-standalone | Mythic-style `oracleEngine.ts`, cards, words, cut-up, vault, snapshots | Leave | Wrong oracle, or replaced by the event log |
| [umpire](https://github.com/zeruhur/umpire) (deprecated) | `src/promptBuilder.ts`, `src/brief.ts` | Read only, for ideas | v0 prompt wording (system rules, dice-band instructions, Report, brief generator); brief import pattern |
| umpire | `src/factionlog/*`, Obsidian plumbing, Gemini provider | Leave | Writes Factionlog 0.2; Factionlog 0.3 Appendix A covers reading 0.2 logs |

**Rules come from upstream only.** The rules files are never copied by hand or edited in the app repo. A rules change is made in the openstrategygames repo, then the submodule is moved to the new commit. Rule comments in the engine cite these files.

**Share, do not fork.** `packages/llm-providers` and `packages/dice` should be published or linked so that Sybyl imports them too. Two copies of provider code drift with every API change.

**Factionlog notation is settled.** Factionlog 0.3.0 (upstream commit `febef41`, 2026-11-16) has one dice line, `d: Strong 2d6kh1[5,3]=5 -> Success`, and the Solo Mode notation: `[Rival:]` with `disp:`, `[Deal:]`, `[Standing:Board|order:...]`, `[Clock:Crisis 1/4]`. Its Appendix A maps every 0.2 form, so old logs stay importable.

## Risks and open decisions

The largest risk is that the LLM makes the game easy or makes it a reading exercise. Both are measurable, so the app should measure them.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Style leak in blind grading | The player writes differently from LLM-written AAs, so the Referee can still tell them apart | Track grade rates per faction and show them in the debrief; optional neutral rewrite of all actions before grading |
| LLM favors the user anyway | Strong grades for weak leverage | Citations required for Strong; Oracle at Even when the player disputes a grade; same checklist for all |
| Invented fiction | Outcomes cite things that never happened | Citation check against the registry; new facts only through accepted outcomes |
| Player becomes a reader | Long drafts replace play | Short drafts by default; each role can be turned off; the player always writes their own action |
| Rules that need judgment | Consolidator "nothing to defend", Veto "makes no sense", optional 6 and 1 effects, Standing | Explicit decision points in the UI, with an LLM suggestion and a player click |
| Weak local models | Ollama models fail schema output | Per-role model mapping; retry then manual fallback |
| Cost and latency | 12 to 18 calls per turn | Batching, cheap models for light roles, cache of the scenario summary |

**Open decisions.**

- [ ] Desktop first (Tauri), or a web PWA first with the same engine?
- [ ] Campaign file: SQLite or JSONL event file?
- [ ] LLM on by default, or an opt-in per role?
- [ ] Shared packages: publish `llm-providers`, `dice` and the Lonelog parser to npm, or share them with Sybyl in one workspace?
- [ ] Licence: the rules content is CC BY-SA 4.0 and Sybyl is MIT; confirm MIT for the app code and CC BY-SA for bundled scenario packs.
- [ ] Group play in scope for 1.0, or after?

## Roadmap

&#91;embedded content: roadmap · 5 milestones, each with a gate\]

M1 is a complete game without any LLM. This proves the engine and the UI, and it stays the fallback. Each LLM role then arrives behind a toggle, so its value can be measured against play by hand.

## Implementation brief for Claude Code

This section is the working brief. Give Claude Code the whole doc and start at milestone M0. The rules files come from the submodule below; do not paste them in.

**Inputs to put in the repo before the first session.**

- Add the rules as a git submodule: `git submodule add https://github.com/openstrategygames/openstrategygames.github.io rules/osg`, then pin it (`febef41` at the time of writing).
- The engine follows `rules/osg/docs/solo_mode.qmd` and `rules/osg/docs/contested_ground.qmd`. `rules/osg/docs/osg_handbook.qmd` explains intent. `rules/osg/docs/factionlog.qmd` (0.3.0) is the notation spec.
- Read-only clones of `zeruhur/sybyl-standalone` and `zeruhur/umpire`, for the salvage table above.

**Target layout.**

```text
osg-app/
  rules/osg/         git submodule: openstrategygames.github.io (read-only)
  packages/
    engine/          new: events, reducer, turn state machine, rules
    dice/            from sybyl diceEngine.ts, with injected Rng
    llm-providers/   from sybyl lib/providers, + generateObject()
    rules-data/      JSON tables + Zod schemas; Corentine solo pack
    factionlog/      Factionlog 0.3 codec on sybyl's Lonelog 1.7 parser
    prompts/         versioned Markdown prompts
  apps/
    desktop/         Tauri 2 + React; shell, keychain, CI from sybyl
    sim/             Node CLI: Monte Carlo harness over packages/engine
```

**Engine rules (hard constraints).**

1. `packages/engine` has no IO, no `Date.now()`, no `Math.random()`. All randomness goes through `Rng`, and every roll is an event with its seed position.
2. State is `fold(events)`. No other mutable game state exists. Every projection can be rebuilt from the log.
3. Each rule function names its source in a comment, e.g. `// solo_mode.qmd Part V, Disposition`.
4. A rule that needs judgment is not decided in the engine. It becomes a **decision point**: the engine stops, the UI asks, the answer is an event.
5. The LLM layer never writes events directly. It returns drafts; only `*Accepted` events change state.

**Deterministic rules the engine implements** (from Contested Ground Part IV and Solo Mode Parts II to VII):

- Resolution: Strong keeps the higher of 2d6, Weak the lower; bands 6, 4 to 5, 2 to 3, 1; doubles flagged.
- Actions in conflict: higher kept die prevails; tie is a standoff; with 3+ actions, the highest prevails and a tie at the top is a standoff among the tied.
- Bonus: Weak becomes Strong; on Strong, a kept 4 or 5 becomes 6, 1 to 3 is unchanged and the bonus is still spent; in conflict the improved result counts as 6.
- Oracle: Likely 2d6 keep higher, Even 1d6, Unlikely 2d6 keep lower; 6 to 1 map to Yes and / Yes / Yes but / No but / No / No and.
- Offers: odds ladder Refused, Unlikely, Even, Likely, Accepted; start Even; shifts from objective fit and disposition; the Hostile and Allied special cases.
- Disposition: five steps, +1 / -1 / -2 per cause once per turn, clamped.
- AA turn order: deal obligation, then hold rule, then table roll; \[target\] filled from behavior rule, Standing and disposition; one veto reroll.
- Signals d6, covert notice checks, Secret uncovering (4 to 5 private, 6 two results, 2 to 3 rumor, 1 on adjudication public), Adaptation triggers, Crisis Clock (length = turns - 1 unless the scenario sets it; +1 per turn; +1 on a bad result or Force of Nature that worsens the Problem; -1 on a 6 that addresses it).

**Decision points** (UI asks, LLM may suggest): opposed or unopposed and collision pairing; leverage grade; whether a Consolidator has something to defend; veto ("makes no sense"); whether keeping a deal "costs something real"; use of a Force of Nature on doubles; the optional 6 and 1 effects; Standing order; acceptance of every LLM draft.

**M0 tasks, with acceptance checks.**

- [ ] Scaffold the pnpm workspace, TS strict, Vitest; add the `rules/osg` submodule; CI checks out submodules and runs `tsc --noEmit` and tests. *Check: CI green on an empty package.*
- [ ] `packages/dice`: port `diceEngine.ts` and its tests; add `Rng` (seedable PCG32 or similar). *Check: Sybyl's tests pass; same seed gives the same rolls.*
- [ ] `packages/engine`: event types, reducer, and the deterministic rules above, one module per Solo Mode part. *Check: unit tests per rule, including every bonus and conflict edge case.*
- [ ] Turn state machine for the 8 steps, with decision points as typed pending states. *Check: a scripted turn reaches `TurnClosed` only after all required events.*
- [ ] `packages/rules-data`: Inspiration tables, behavior rules, generic AA and Secret tables, and the Corentine solo scenario (Solo Mode Appendix A) as JSON with Zod schemas. *Check: schema validation in tests.*
- [ ] Drift test: parse the Markdown tables in `rules/osg/docs/solo_mode.qmd` and compare them with `rules-data`. *Check: the test fails when an upstream table changes and the JSON does not.*
- [ ] Replay test: Solo Mode Appendix B (Essaveth, Turn 1) as a fixed event script. *Check: replaying it yields the same Standing, dispositions, deal and Clock as the appendix.*
- [ ] `apps/sim`: run N random games with decision points answered by simple policies. *Check: prints outcome rates and turn counts; deterministic for a given seed.*

**Out of scope for M0:** any UI, any LLM call, Factionlog export, group play.

**Conventions** (from the Umpire and Sybyl repos): two-space indent, double quotes, exported interfaces in a `types.ts` per package, small focused modules, no em dashes in user-facing text.
