# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A referee's desk for freeform Open Strategy Games (OSG), solo first: the player writes, the engine keeps state and rolls dice, an LLM drafts what a human Referee or rival player would write. Release 1 is solo play (one human Actor, 2 to 4 Autonomous Actors, 4 to 8 turns) under Contested Ground 1.0 + Solo Mode 1.0. Async group play comes later on the same engine.

The design source of truth is `Freeform Strategy App Architecture and Stack (OSG Solo).md` (architecture, data model, LLM roles, stack, salvage table, M0 brief). The milestone plan is `docs/PLAN.md`. Read both before structural work.

**Status:** Phase 1 (M0, the rules engine) is in progress on branch `m0/engine`, specified in `docs/phase-1-engine.md`. Follow its work order (section 9), one commit per step. Its appendix lists rule ambiguities that are resolved by flags or decision points. Don't invent a third resolution.

## Commands

pnpm workspace (`pnpm@10.20.0` via `packageManager`), TypeScript ~5.8 strict, Vitest 5 with one project per package (root `vitest.config.ts`). Node ≥ 22 (CI runs 22).

```sh
git submodule update --init          # rules/osg must be present; tests read it
pnpm install
pnpm test                            # every project (root workspace tests + packages/* + apps/*)
pnpm vitest run --project @osg/engine                        # one package
pnpm vitest run packages/engine/src/rules/resolution.test.ts # one file
pnpm vitest run -t "bonus on Strong"                         # one test by name
pnpm typecheck                       # root tsc, then each package's own `typecheck` script (CI gate)
pnpm sim --games 1000 --seed 42      # Monte Carlo harness (apps/sim, from step 9)
```

On this Windows machine pnpm is not on PATH globally: use `corepack pnpm ...`. Scripts that call `pnpm` again (such as `typecheck`) need a `pnpm` shim on PATH, or `corepack enable`.

Each new package needs a `typecheck` script (`tsc --noEmit`), a `test` script, a tsconfig that extends `../../tsconfig.base.json`, and a `vitest.config.ts` whose project `name` is the package name.

## Rules source

- `rules/osg/` is a git submodule of `openstrategygames/openstrategygames.github.io`, pinned (`0d96334`, Factionlog 0.3.0). **Never edit or copy rules text in this repo.** Fix rules upstream, then bump the submodule.
- `rules/osg/docs/solo_mode.qmd` (Parts I to XII, Appendix A Corentine, B worked turn, C generator) and `contested_ground.qmd` (Part IV resolution, Part V Report) are what the engine implements. `osg_handbook.qmd` explains intent. `factionlog.qmd` is the export notation spec.
- `packages/rules-data` holds the tables as JSON + Zod. A drift test parses the Markdown tables in `solo_mode.qmd` and fails when they no longer match the JSON.

## Architecture: the rules that decide most choices

**The engine owns state and dice, the LLM proposes, the player confirms.**

- **Event-sourced.** The game is an append-only event log. State is `fold(events)`; there is no other mutable game state. Every screen and every LLM context is a projection. Undo, replay, audit and Factionlog export all come from the log.
- **`packages/engine` is pure:** no IO, no `Date.now()`, no `Math.random()`. All randomness goes through an injected `Rng` (from `packages/dice`), and every roll is an event that records its seed position.
- **Each rule function cites its source** in a comment, e.g. `// solo_mode.qmd Part V, Disposition`.
- **Judgment is not decided in code.** Rules that need judgment (collision class/pairing, leverage grade, Consolidator "nothing to defend", veto "makes no sense", deal "costs something real", Force of Nature on doubles, optional 6/1 effects, Standing order, every draft acceptance) become **decision points**: the turn state machine stops in a typed pending state, the UI asks, the answer is an event.
- **Ordering is enforced by the state machine:** the player's action locks at step 3 before any AA action, roll or LLM output for the turn exists. In step 5, the classification and grades are stored as events *before* the engine rolls. A grade cannot change after its roll. The outcome text is drafted last.
- **LLM output is always a draft.** Roles return typed objects (Zod-validated, then engine-checked: cited fact ids exist and are visible to that role, Strong grades carry three cited checklist answers). On a failure the engine retries once with the error text, then falls back to manual entry. Only `*Accepted` events change state; the LLM layer never writes events. The game must be fully playable with no LLM.
- **The fact registry is the core.** Facts have visibility (public / private to a faction / player-only). The context builder filters by visibility *before* selecting by tag and recency, so a role can't see facts it shouldn't. The Referee role grades **blind**: factions relabeled A/B/C, actions shuffled, the player's faction hidden.
- **Same rules for every faction.** The player and the AAs use the same checklist, prompts and validators.

## Sibling repos (read-only salvage sources, cloned next to this repo)

- `../sybyl-standalone/app/src/lib/`: `providers/` (Anthropic/OpenAI/Gemini/Ollama + `stream.ts`) → `packages/llm-providers` (add `generateObject()`); `toolkit/diceEngine.ts` → `packages/dice` (swap `Math.random` for `Rng`); `lonelog/` (Lonelog 1.7 parser, tag replay) → `packages/factionlog`; `keychain.ts`, `usage.ts`, `src-tauri/`, CI workflows, UI components, `App.css`. Do not port Sybyl's `App.tsx`, Mythic-style `oracleEngine.ts`, vault or snapshots.
- `../umpire/` is deprecated. Read `src/promptBuilder.ts` and `src/brief.ts` for prompt-wording ideas only.
- `llm-providers` and `dice` are meant to be shared with Sybyl, not forked. The sharing mechanism is still an open decision.

## Conventions

Two-space indent, double quotes, exported interfaces in a `types.ts` per package, small focused modules. No em dashes in user-facing text (UI strings, prompts, Report output).
