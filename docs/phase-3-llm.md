# Phase 3 (M2): The Assisted Turn: Implementation Spec

Goal (PLAN.md M2): a solo game where the player writes only their own action and otherwise reviews drafts. Playing M1 by hand showed that solo play needs every drafting role of the turn, not a first few: the AA actions, the grades, the outcomes and the Report all have to be drafted.

**Gate:** a full Corentine game played in `tauri dev` with every M2 role on, the player only confirming or correcting drafts; with any role off, that step falls back to the M1 form; a forced invalid output goes to one retry, then manual entry; no role's prompt contains a fact it can't see, and the Referee prompt never names the player's faction (both tested); at most 10 calls per turn with 3 AAs and no Offers or Oracle questions.

Branch: `m2/llm`, from `m1/desktop` once M1 is merged. One commit per work step.

---

## 0. Decisions taken

- **Provider and model.** Anthropic, `claude-haiku-5-5` for every role by default (about 15 cents per 6-turn game at list prices; Opus 5.5 was judged too expensive). Provider, model and effort are set per role, so a role whose drafts are weak moves alone to `claude-sonnet-5-5`. OpenAI, Gemini and Ollama come from Sybyl and work through the same interface; prompts are tuned on Haiku.
- **Sharing with Sybyl.** `packages/llm-providers` is a workspace package here, extracted from Sybyl. Published to npm once the API settles; Sybyl then switches to it (PLAN.md open decisions).
- **Anthropic through the official SDK** (`@anthropic-ai/sdk`, `dangerouslyAllowBrowser: true` in the Tauri webview): typed errors, built-in retries on 429/5xx, structured outputs. The other three providers keep Sybyl's `fetch` code.
- **Structured output, not forced tool use.** Each role's output is a Zod schema, sent as a JSON Schema (`z.toJSONSchema`, objects closed with `additionalProperties: false`): Anthropic `output_config.format`, OpenAI `response_format: json_schema`, Gemini `responseSchema`, Ollama `format`. No `temperature` (current Claude models reject it).
- **Roles are on by default once a key is set**, each with its own toggle. The user asked for every step drafted; the M3 metrics will show which roles earn their place.
- **Drafts are generated automatically** when their decision opens (a per-role setting turns that off; a "Draft" button then asks for one).
- **Keys** live in the OS keychain (Rust `keyring` commands from Sybyl, service `osg-solo`). In a plain browser (`vite dev`) the key stays in memory for the session and is never stored.
- **Rules text in prompts is read from the submodule at build time**, never copied: a prompt names a section by file and heading path, and a test fails when a heading no longer exists (like the rules-data drift test).

---

## 1. Layout

```
packages/
  llm-providers/       from Sybyl: providers (anthropic, openai, gemini, ollama), stream, usage;
                       + generateObject; + FakeProvider for tests
  llm/                 the host layer: context builder, aliases, relabeling, roles, prompts,
                       validators, runner (retry, fallback), provenance
    src/prompts/       one Markdown template per role, version in frontmatter
    src/roles/         aaPlayer, referee, narrator, reporter, oracle, offerVoice
apps/desktop/
  src-tauri/           + keyring commands
  src/settings/        Settings screen: key, and per role: on/off, provider, model, effort, auto
  src/assist/          useDraft hook, DraftCard, wiring of roles into the step forms
```

`packages/engine` stays pure and knows nothing of providers; it only records drafts and acceptances (section 3). `packages/llm` depends on the engine, `llm-providers` (interface only) and `rules-data`; it does no IO except through the provider it is given.

---

## 2. `packages/llm-providers`

Extract Sybyl's `providers/*`, `stream.ts`, `usage.ts` and their tests. Add to the provider interface:

```ts
generateObject<T>(request: {
  model: string;
  system: { text: string; cache?: boolean }[];   // stable blocks first; cache marks the breakpoint
  user: string;
  schema: z.ZodType<T>;
  maxOutputTokens: number;
  effort?: "low" | "medium" | "high";
}, signal?: AbortSignal): Promise<{ value: unknown; raw: string; usage: Usage }>;
```

It returns the parsed JSON unvalidated; validation belongs to the runner, so a schema failure can be retried with its error text. `FakeProvider` answers from a script (`(role, request) => output`) and records every request: the role tests and the gate tests run on it.

**Checks:** each provider's `generateObject` against a mocked `fetch` (request shape, schema placement, usage parsing, API errors surfaced as typed errors); Sybyl's existing tests pass.

---

## 3. Engine changes (`packages/engine`)

Drafts go into the log, so a reopened campaign shows the same drafts without paying for them again, and the M3 metrics (acceptance and edit rates) come from the log.

- **Command `recordDraft`** `{ id, role, for: DraftTarget, output, provenance }`, emitted as **`DraftRecorded`** with author `llm:<role>`. `DraftTarget` names the decision it answers (`{ kind: "writeAAAction", aa }`, `{ kind: "classify" }`, `{ kind: "writeOutcome", actions }`, `{ kind: "report" }`, `{ kind: "settleOffer", offer }`) or an Oracle event (`{ kind: "oracle", seq }`). **The engine refuses a draft whose decision is not open**, which makes "no AA output before the lock" and "grades before the roll" hold for LLM output too. It changes no game state; the reducer keeps `drafts[id] = { role, turn, accepted }`.
- **`ExecuteOptions.draft`** `{ id, edited }`: the accepting command first emits **`DraftAccepted`** `{ draft, edited }`, then its own events as usual. A draft that is regenerated or discarded simply never gets one.
- **Crumbs.** `NewFact.crumbOf?: number` (index of the private fact in the same `facts` array) becomes `Fact.crumbOf?: FactId`: a private outcome's public crumb, linked to its truth (Contested Ground Part V, Private Outcomes and Traceable Crumbs).
- `Provenance`: `{ promptVersion, provider, model, effort, inputFacts: FactId[], attempts, usage: { input, output, cacheRead }, error? }`.

**Checks:** a draft for a closed decision is refused; `DraftAccepted` precedes the command's events and folds; undo of an acceptance leaves the draft in place; a crumb links to its truth; Appendix B and the sim still pass.

---

## 4. `packages/llm`: the host layer

### Context builder

`contextFor(state, viewer, budget)`: **visibility first, then selection.**

- **Viewers.** `faction(id)` sees public facts, facts private to it, and facts in whose `knownBy` it appears. `player` is `faction(player)` plus player-only facts. `referee(acting)` sees public facts, the private facts of every faction acting this turn and every fact an action cites. `narrator` sees all facts. `public` sees public facts only.
- **Selection** inside the viewer's facts: those tagged with the factions, locations and threads the call names, then the rest by recency, until the role's budget (estimated at 4 characters per token) is used. Always included: the scenario summary (problem, map, Clock and landed Escalations, Standing) and the last Report's header.
- **Aliases.** Facts are shown as `[F1] text`; cited ids are mapped back. Real ids (`saivorn-position-1`) name factions, and short aliases are cheaper.
- **Relabeling (Referee only).** Factions become Faction A, B, C...; every faction name in every text is replaced, with the setup tagger's matcher (the distinctive word, so "House Meranto" and "Meranto"). The order is shuffled with a generator seeded from `${seed}:referee:${turn}`, separate from the game's dice stream. Bonus names are left out.

### Runner

`runRole(role, state, target, settings, provider)`:
1. build the context and the prompt (system: role instructions + rules sections + scenario summary, cached when long enough; user: the call's data);
2. `generateObject`; parse with the role's Zod schema; run the role's engine checks;
3. on a failure, **one retry** with the error text appended; on a second failure, or a provider error, return `{ failed, error }` and the UI shows the manual form with the error;
4. on success, return the output mapped back to real ids, with provenance, for `recordDraft`.

**Checks common to every role:** every cited fact exists and is visible to the role's viewer; every faction named is in the game; a Strong grade has three checklist answers, each citing at least one fact. **Visibility property test:** over sim games, for every role call at every step, every fact in the prompt is visible to that role's viewer; no Referee prompt contains the player's faction id or name.

---

## 5. Roles

| Role | When (decision open) | Viewer | Output (Zod) | Fills |
| --- | --- | --- | --- | --- |
| **AA Player**, one per AA | `writeAAAction` (table entry, rule, obligation or exploit) | `faction(aa)` + its brief, behavior, disposition, deals, the rolled entry and target | `{ act, out, lev, citedFacts[], targets?, covert?, investigates? }` | `writeAAAction` |
| **Referee**, one per turn | `classify` | `referee(acting)`, relabeled; every action this turn, shuffled | `{ groups[{ class, actions[], why }], bothCanBeTrue[{ group, value, why }], grades[{ action, grade, checklist[3]{ answer, citedFacts[] } }] }` | `classify`, `judgeConflict`, `grade` |
| **Narrator**, one per turn | every `writeOutcome` open (the first time no other step 5 decision is left) | `narrator`; each action with its class, grades, dice, band, Inspiration, Force of Nature, Secrets uncovered | `{ outcomes[{ action, text, friction, hook, rat{ r, a, t }, facts[{ text, visibility, crumbOf? }] }] }` | `writeOutcome` per action |
| **Reporter** | `report` | `public`; the turn's public facts and crumbs, overt actions' headers, Clock line, landed Escalation, open threads | `{ header, paragraphs[], crumbs[], closing, newThreads[] }` | `publishReport` |
| **Oracle Interpreter** | after `askOracle` (on request) | `player` | `{ readings[1..2] }` | shown under the answer |
| **Offer voice** | `settleOffer` | `faction(aa)` + the Offer, the rolled answer, its follow-up | `{ reply, condition?, counter? }` | `settleOffer` |

Notes:
- **Referee:** grades every action, so a classification the player changes still has grades for each action. It never sees bonuses: whether an AA's bonus is in scope stays the player's answer. "Dispute" on a grade is the existing `gradeByOracle` (Oracle at Even).
- **AA Player:** writes to win, with the same checklist the player sees (Part III, Grading Leverage). The veto ("makes no sense") stays the player's call; after a reroll the new entry gets a new draft.
- **Narrator:** one batch so outcomes agree with each other; "Redraft this one" calls it for a single action. Each outcome needs friction (Contested Ground Part IV, No Action Without Friction) and a RAT self-check.
- **Judgment decision points** (deal costs, Consolidator threat, Force of Nature, Inspiration, Clock effects, Standing) stay player clicks in M2; LLM suggestions for them are M3.

Prompt sections from the rules (by heading): Solo Part III Grading Leverage, Part IV The AA Brief and Behavior Rules, Part V Making an Offer; Contested Ground Part IV (The Core Assessment, Actions in Conflict, Joint Actions, The RAT Checklist, No Action Without Friction) and Part V (The Report, Hook-Seeding, Private Outcomes and Traceable Crumbs).

Defaults: effort `medium` for Referee and Narrator, `low` for the rest; output caps 2,000 tokens (AA, Oracle, Offer), 4,000 (Referee, Reporter), 8,000 (Narrator).

**Load per turn with 3 AAs:** 3 AA + 1 Referee + 1 Narrator + 1 Reporter = 6 calls, plus one per Offer and per Oracle reading asked for, plus retries.

---

## 6. Desktop

- **Settings** (gear in the top bar): API key per provider (keychain), and per role: on/off, provider, model, effort, generate automatically.
- **DraftCard** above each form whose role is on: "Draft by Referee · claude-haiku-5-5", a spinner while it runs, then the form **prefilled** from the draft. Accept submits it (`edited: false`); changing any field and submitting records `edited: true`; Redraft calls again; Write by hand clears the form. On failure the card shows the error and the empty form.
- **Referee review** shows each grade's three checklist answers with their cited facts (real names restored), so a grade is checked, not trusted.
- **Narrator review** shows friction, hook and RAT under each outcome; new facts list their visibility and crumb link.
- **Usage:** the Log panel shows tokens per draft; the Debrief adds calls and tokens per game.

---

## 7. Work order

| # | Step | Done when |
| --- | --- | --- |
| 1 | `packages/llm-providers`: extract from Sybyl, Anthropic on the SDK, `generateObject` for four providers, `FakeProvider` | provider tests pass |
| 2 | Engine: `recordDraft` / `DraftRecorded`, `ExecuteOptions.draft` / `DraftAccepted`, `crumbOf` | section 3 checks; Appendix B and sim green |
| 3 | `packages/llm`: context builder, viewers, aliases, relabeling, rules sections, runner, common checks | visibility property test; retry then fallback on a scripted bad output |
| 4 | Keychain commands and the Settings screen | key saved and read back in `tauri dev` |
| 5 | AA Player + DraftCard in step 4 | a turn's AA actions drafted and accepted with the fake provider |
| 6 | Referee in step 5 (classify, bothCanBeTrue, grades) | blind test: no player name or id in the prompt |
| 7 | Narrator in step 5 | outcomes with friction, facts and crumbs accepted |
| 8 | Reporter in step 8 | a Report drafted and published |
| 9 | Oracle Interpreter and Offer voice | readings and replies shown and used |
| 10 | Verification: a full game on the fake provider in a desktop test (all roles on; each role off in turn); then a full Corentine game with Haiku 5.5 in `tauri dev`, noting weak drafts per role | the M2 gate |

Out of scope for M2: LLM suggestions for judgment decision points, Standing proposal and Adaptation rewrites by LLM, Signal lines, the Take-stock brief, streaming, metrics beyond token counts (all M3); Factionlog and the scenario builder (M4).
