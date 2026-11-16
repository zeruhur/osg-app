import type { GameEvent, GameState, OracleOdds } from "@osg/engine";
import { Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Field } from "../components/common";
import { ClockBar, DispositionBadge, nameOf } from "../components/game-bits";
import type { StoredBatch } from "../store";
import { ReportView } from "../turn/TakeStock";
import type { Run } from "../turn/shared";

/** Dashboard: factions, deals, the Clock and its Escalations. */
export function Dashboard({ state }: { state: GameState }) {
  const deals = Object.values(state.deals);
  return (
    <div className="panel">
      <h4>Crisis Clock</h4>
      <ClockBar state={state} />
      <ul className="escalations">
        {state.clock.escalations.map((e) => (
          <li key={e.box} className={e.landed ? "landed" : undefined}>
            <strong>
              {e.box}. {e.title}
            </strong>
            {e.landed && <span className="badge">landed</span>}
          </li>
        ))}
      </ul>
      <p className="dim">Forces of Nature used: {state.forceOfNatureUsed} of 2</p>

      <h4>Factions</h4>
      {state.standing.map((id) => {
        const f = state.factions[id]!;
        const aa = state.aa[id];
        return (
          <div key={id} className="faction-row">
            <div>
              <strong>{f.name}</strong>
              {id === state.player && <span className="you-tag">you</span>}
              {aa && <DispositionBadge value={aa.disposition} />}
              {aa && <span className="badge">{aa.behavior}</span>}
            </div>
            <div className="dim">{aa ? aa.objective : f.objectives.shortTerm}</div>
            {f.bonuses.map((b) => (
              <div key={b.name} className="dim">
                {b.name}: {b.usesLeft} of {b.uses} left
              </div>
            ))}
            {aa?.secrets.map((s) => (
              <div key={s.index} className="secret">
                Secret ({s.status}): {aa.secretTable[s.index]}
              </div>
            ))}
          </div>
        );
      })}
      {Object.values(state.factions)
        .filter((f) => f.kind === "background")
        .map((f) => (
          <div key={f.id} className="faction-row dim">
            {f.name} (background)
          </div>
        ))}

      <h4>Deals</h4>
      {deals.length === 0 && <p className="dim">None.</p>}
      {deals.map((d) => (
        <div key={d.id} className={`deal deal-${d.status}`}>
          {d.parties.map((p) => nameOf(state, p)).join(" / ")}: {d.terms}
          <div className="dim">
            {d.status}
            {d.brokenBy ? ` by ${nameOf(state, d.brokenBy)}, turn ${d.brokenTurn}` : ""} · since turn {d.since}
            {d.until !== undefined ? `, until turn ${d.until}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Facts: everything established, filterable. */
export function Facts({ state }: { state: GameState }) {
  const [filter, setFilter] = useState<"all" | "public" | "private" | "rumor">("all");
  const [faction, setFaction] = useState("");
  const [query, setQuery] = useState("");
  const facts = Object.values(state.facts)
    .filter((f) => filter === "all" || (filter === "rumor" ? f.status === "rumor" : filter === "public" ? f.visibility.kind === "public" : f.visibility.kind !== "public"))
    .filter((f) => !faction || f.tags.factions.includes(faction))
    .filter((f) => !query || f.text.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.source - a.source);
  return (
    <div className="panel">
      <div className="row">
        <select aria-label="Visibility" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All facts</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
          <option value="rumor">Rumors</option>
        </select>
        <select aria-label="Faction" value={faction} onChange={(e) => setFaction(e.target.value)}>
          <option value="">Any faction</option>
          {Object.values(state.factions).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <input aria-label="Search facts" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="facts">
        {facts.map((f) => (
          <li key={f.id}>
            {f.text}
            <div className="fact-meta">
              {f.visibility.kind === "public" ? "public" : f.visibility.kind === "private" ? `private to ${nameOf(state, f.visibility.faction)}` : "yours only"}
              {f.knownBy.length > 0 && `, also known by ${f.knownBy.map((k) => nameOf(state, k)).join(", ")}`}
              {f.status === "rumor" && " · rumor"} · turn {f.turn} · {f.origin}
            </div>
          </li>
        ))}
      </ul>
      {facts.length === 0 && <p className="dim">No facts match.</p>}
      <h4>Threads</h4>
      <ul className="facts">
        {Object.values(state.threads).map((t) => (
          <li key={t.id} className={t.closed !== undefined ? "dim" : undefined}>
            {t.text}
            <div className="fact-meta">
              opened turn {t.opened}
              {t.closed !== undefined ? `, closed turn ${t.closed}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const COMMAND_LABEL: Record<string, string> = {
  setup: "Setup",
  startGame: "Start the game",
  openTurn: "Open the turn",
  advance: "Next step",
  askOracle: "Ask the Oracle",
  makeOffer: "Offer",
  settleOffer: "Settle the Offer",
  answerSignalOffer: "Answer a Signal Offer",
  breakDeal: "Break a deal",
  declareAction: "Declare",
  answerDealCost: "Deal cost",
  answerThreat: "Consolidator threat",
  vetoEntry: "Veto",
  chooseTarget: "Choose target",
  writeAAAction: "AA action",
  classify: "Classify",
  judgeConflict: "Both can be true?",
  grade: "Grade",
  gradeByOracle: "Grade by the Oracle",
  answerForceOfNature: "Force of Nature",
  answerInspiration: "Inspiration",
  chooseInspirationTarget: "Inspiration target",
  answerClockEffect: "Clock",
  answerInvestigationSix: "Investigation",
  revealToAA: "Reveal to an AA",
  writeOutcome: "Outcome",
  answerExposure: "Exposure",
  answerInterested: "Interested AAs",
  answerDisposition: "Disposition",
  rewriteEntry: "Adaptation",
  changeObjective: "New objective",
  setStanding: "Standing",
  publishReport: "Report",
  confirmSecret: "Confirm a rumor",
  closeThread: "Close a thread",
  writeDebrief: "Debrief"
};

/** Log: one row per command, newest first; undo the last one. */
export function LogPanel({ batches, onUndo }: { batches: readonly StoredBatch[]; onUndo: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const rows = [...batches].reverse();
  return (
    <div className="panel">
      <button onClick={onUndo} disabled={batches.length <= 1} title="Undo the last command: the same dice come back if you redo it">
        <Undo2 size={14} /> Undo the last command
      </button>
      <ol className="log" reversed>
        {rows.map((b) => {
          const first = b.events[0];
          return (
            <li key={b.batch}>
              <button className="log-row" onClick={() => setOpen(open === b.batch ? null : b.batch)} aria-expanded={open === b.batch}>
                <span>{COMMAND_LABEL[b.command] ?? b.command}</span>
                <span className="dim">{first && first.turn ? `T${first.turn}·${first.step}` : ""}</span>
              </button>
              {open === b.batch && (
                <ul className="log-events">
                  {b.events.map((e) => (
                    <li key={e.seq}>
                      <code>{e.type}</code> {summary(e)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function summary(e: GameEvent): string {
  if ("roll" in e && e.roll) return `[${e.roll.faces.join(", ")}]${"answer" in e ? ` → ${e.answer}` : ""}`;
  if (e.type === "ResultBanded") return `${e.action}: ${e.band}`;
  if (e.type === "DispositionChanged") return `${e.aa}: ${e.from} → ${e.to}`;
  return "";
}

/** Reports: every published Report. */
export function Reports({ state }: { state: GameState }) {
  const turns = Object.keys(state.reports).map(Number).sort((a, b) => b - a);
  return (
    <div className="panel">
      {turns.length === 0 && <p className="dim">No Reports yet.</p>}
      {turns.map((t) => (
        <ReportView key={t} report={state.reports[t]!} turn={t} />
      ))}
    </div>
  );
}

/** Oracle: ask any yes/no question the fiction hasn't settled; answers are logged. */
export function Oracle({ log, run }: { log: readonly GameEvent[]; run: Run }) {
  const [question, setQuestion] = useState("");
  const [odds, setOdds] = useState<OracleOdds>("even");
  const asked = useMemo(
    () => log.filter((e): e is Extract<GameEvent, { type: "OracleConsulted" }> => e.type === "OracleConsulted").reverse(),
    [log]
  );
  return (
    <div className="panel">
      <p className="dim">Ask what you would ask a Referee, never what your own faction should do. Choose the odds before you roll. Ask once.</p>
      <Field label="Question">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} />
      </Field>
      <div className="row">
        <select aria-label="Odds" value={odds} onChange={(e) => setOdds(e.target.value as OracleOdds)}>
          <option value="likely">Likely (2d6 keep higher)</option>
          <option value="even">Even (1d6)</option>
          <option value="unlikely">Unlikely (2d6 keep lower)</option>
        </select>
        <button
          className="primary"
          disabled={!question.trim()}
          onClick={async () => {
            if (await run({ type: "askOracle", question, odds })) setQuestion("");
          }}
        >
          Ask
        </button>
      </div>
      <ul className="facts">
        {asked.map((e) => (
          <li key={e.seq}>
            {e.question} <span className="dim">({e.odds})</span>
            <div>
              <strong>{ANSWERS[e.answer]}</strong> <span className="dim">[{e.roll.faces.join(", ")}]</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ANSWERS: Record<string, string> = { "yes-and": "Yes, and…", yes: "Yes", "yes-but": "Yes, but…", "no-but": "No, but…", no: "No", "no-and": "No, and…" };
