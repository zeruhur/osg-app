# Phase 2 (M1): Desktop App, Played by Hand: Implementation Spec

Goal (PLAN.md M1): play the Corentine scenario start to finish with no API key. This build stays the fallback forever.

**Gate:** a full Corentine game is played by hand in `tauri dev`; closing and reopening the app at any step restores the same state; undo works across a turn boundary.

Branch: `m1/desktop`. One commit per work step, as in M0.

---

## 0. Decisions taken

From the open decisions in PLAN.md, using its recommendations:

- **Desktop first (Tauri 2).** The UI is plain React and talks to the game only through `@osg/engine` and a `CampaignStore`, so a web build stays possible.
- **SQLite, one file per campaign** (`<appData>/campaigns/<id>.sqlite`, Tauri SQL plugin), behind a `CampaignStore` interface. A browser implementation (IndexedDB) backs `vite dev` in a plain browser and the UI tests; the memory implementation backs unit tests.
- **No LLM, no keychain, no provider settings** in M1. Settings hold only the theme.
- **Plain text fields, not CodeMirror,** for writing actions, outcomes and the Report. The Report is structured (header, paragraphs, crumbs, closing), which fits fields better than a free editor. CodeMirror arrives with streaming drafts (M3) and Factionlog (M4).
- **Look:** Sybyl's design tokens and components (`App.css` variables, dark and parchment-light themes, serif body, violet accent, lucide icons), so the two apps feel related.

---

## 1. Layout

```
apps/desktop/
  index.html, vite.config.ts, vitest.config.ts, tsconfig.json
  src-tauri/           Tauri 2 shell: from Sybyl, renamed; plugins: sql (sqlite), dialog, opener
  src/
    main.tsx, App.tsx  routes: campaign list | new campaign | game | debrief
    app.css            Sybyl tokens + this app's components
    store/             CampaignStore + memory, IndexedDB, SQLite implementations
    session/           CampaignSession (engine + store, no React) and useCampaign hook
    components/        shared UI (from Sybyl: ConfirmModal, StatusToast, SideDrawer, useDismiss)
    screens/           CampaignList, NewCampaign, Game, Debrief
    turn/              one view per step; one form per Decision kind
    panels/            Dashboard, Facts, Log (undo), Reports, Oracle
```

---

## 2. Storage (`store/`)

```ts
interface CampaignMeta { id; title; packId; variant; player; turns; createdAt; updatedAt; turn; status }
interface StoredBatch { batch: number; command: string; events: GameEvent[] }

interface CampaignStore {
  list(): Promise<CampaignMeta[]>;
  create(meta: CampaignMeta, setup: GameEvent[]): Promise<void>;   // batch 0
  load(id): Promise<{ meta; batches: StoredBatch[] }>;
  append(id, batch: StoredBatch, meta: Partial<CampaignMeta>): Promise<void>;
  undo(id): Promise<StoredBatch | undefined>;                     // removes the last batch (never batch 0)
  remove(id): Promise<void>;
}
```

- **A batch is one command's events** (the command plus every automatic task it triggered). Undo removes the last batch, so it steps back one player action at a time, across turn boundaries too.
- **Undo can't reroll.** Dice come from `(seed, position)`, so undoing and redoing the same command gives the same dice. Undoing and doing something different (another grade) reads the same dice differently, which is fair: the dice were already "on the table".
- SQLite schema: `meta(key, value)`, `events(seq INTEGER PRIMARY KEY, batch INTEGER, json TEXT)`, `batches(batch INTEGER PRIMARY KEY, command TEXT, at TEXT)`. Append and undo are single transactions.
- Every load folds the events; there is no projection cache in M1 (a 6-turn game is about 300 events, folded in milliseconds).
- Campaign ids and seeds are made in the UI (`crypto.randomUUID()`); the engine never sees the clock or global randomness.

**Checks:** a shared contract test runs against the memory and IndexedDB stores (fake-indexeddb); the SQLite store is exercised in `tauri dev`.

---

## 3. Session (`session/`)

`CampaignSession` (plain TS, tested without React): holds `log`, `state`, the batch list; `run(command)` → `execute` → append the batch to the store → new state; `undo()`; `requirements()` (nextRequired). Engine errors become user-facing messages and change nothing. `useCampaign(id)` wraps it with React state.

**Check:** the Appendix B turn played through `CampaignSession` with the memory store; reloading from the store at every batch gives the same state; undo across `TurnClosed` restores the previous turn.

---

## 4. Screens

- **Campaign list:** title, scenario, faction, turn, last played; new, open, delete (confirm).
- **New campaign:** pack → variant (recommended preselected) → faction (each faction's public line and brief) → turns (4/6/8) → title → create (setup events, batch 0) → game.
- **Game:** left rail with the turn and the 8 steps (done / current / ahead), the Clock and Standing at a glance; centre: the current step; right drawer: Dashboard, Facts, Log, Reports, Oracle.
- **Debrief** (after `GameEnded`, Solo Part XI): closing frame (one line per faction), the four debrief questions as text fields, per-faction grade rates (Strong %) and other numbers from the log.

## 5. Step views and decision forms

Each step view shows its open decisions as forms (one component per `Decision` kind) and an **Advance** button enabled by `canAdvance`. Optional actions sit beside them: Offers (step 2), veto / deal reroll (step 4), Ask the Oracle (any time), break a deal (steps 2-3), change an AA objective (step 7), confirm a rumor (any time).

| Step | Shows | Forms |
| --- | --- | --- |
| 1 Take stock | last Report, Standing, Deals, Clock, open threads | none |
| 2 Talk | AAs with disposition and the Offer odds preview | `makeOffer` (terms, obligations per party, fit questions, until), `settleOffer`, `signalOffer` |
| 3 Declare | brief, bonuses, facts to cite | `declare` (act / out / lev, bonus, targets, investigates, covert, joint partners) |
| 4 AA actions | each AA's brief, its roll, entry and target | `dealKeepCost`, `consolidatorThreat`, `targetChoice`, `writeAAAction`; veto, deal reroll |
| 5 Adjudicate | all actions; groups; dice and bands as they land | `classify` (drag or pick groups), `bothCanBeTrue`, `grade` (Strong / Weak / ask the Oracle; bonus scope; the Part III checklist shown), `forceOfNature`, `inspiration`, `inspirationTarget`, `clockEffect`, `investigationSix`, `revealToAA`, `writeOutcome` (text, friction, new facts with visibility) |
| 6 Signals | each AA's Signal | `exposure`, `interested` |
| 7 Update | turn summary | `dispositionCauses`, `adaptation` (pick entry, rewrite), `standing` (reorder the proposal) |
| 8 Report | the turn's outcomes, crumbs, landed Escalation | `report` (header, paragraphs prefilled one per action, crumbs, Clock line, closing, new threads) |

Text the rules want is shown where it's needed: the grading checklist (Part III), the behavior rule, the Offer odds steps, the Inspiration entry, the Escalation text.

---

## 6. Work order

| # | Step | Done when |
| --- | --- | --- |
| 1 | Scaffold `apps/desktop` (Vite + React 19 + TS strict + Vitest/jsdom), Tauri 2 shell from Sybyl renamed, SQL plugin, icons; CI typechecks, tests and `vite build`s it | `pnpm --filter @osg/desktop dev` serves a page; `tauri dev` opens a window; CI green |
| 2 | `CampaignStore`: memory, IndexedDB, SQLite | contract tests pass for memory and IndexedDB |
| 3 | `CampaignSession` + `useCampaign` | section 3 check |
| 4 | App shell: theme, campaign list, new campaign, game layout, drawer | create, list, open, delete a campaign in the browser |
| 5 | Steps 1-4 views and forms | Appendix B steps 1-4 playable in the browser |
| 6 | Steps 5-8 views and forms | Appendix B Turn 1 playable to `TurnClosed` in the browser |
| 7 | Panels (Dashboard, Facts, Log + undo, Reports, Oracle) and the Debrief | a full game playable; undo across a turn |
| 8 | Verification: browser walkthrough of Appendix B; `tauri dev` with SQLite; your full game by hand | the M1 gate |

Out of scope for M1: LLM roles, Factionlog export, scenario generator, release signing.
