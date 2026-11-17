import type { GameState } from "@osg/engine";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Field, RuleNote } from "../components/common";
import { nameOf } from "../components/game-bits";
import { DecisionBox, type Run } from "./shared";

/** Step 8 (solo_mode.qmd Part X, 8): third person, news-roundup style, short. */
export function ReportStep({ state, run }: { state: GameState; run: Run }) {
  const cur = state.current;
  const landedNow = state.clock.escalations.filter((e) => e.landed && !Object.values(state.reports).some((r) => r.clockLine?.includes(e.title)));
  const [header, setHeader] = useState("");
  const [paragraphs, setParagraphs] = useState<string[]>(() =>
    cur.order.map((id) => {
      const a = cur.actions[id]!;
      return `${nameOf(state, a.faction)}: ${cur.adjudication[id]?.outcome ?? ""}`;
    })
  );
  const [crumbs, setCrumbs] = useState<string[]>(() =>
    Object.values(state.facts)
      .filter((f) => f.turn === state.turn && f.origin === "play" && f.visibility.kind === "public")
      .map((f) => f.text)
  );
  const [clockLine, setClockLine] = useState(() => landedNow.map((e) => `${e.title}. ${e.text}`).join(" "));
  const [closing, setClosing] = useState("");
  const [threads, setThreads] = useState<string[]>([]);

  const list = (label: string, value: string[], set: (v: string[]) => void, rows = 2) => (
    <div className="list-editor">
      <span className="field-label">{label}</span>
      {value.map((v, i) => (
        <div key={i} className="obligation">
          <textarea value={v} rows={rows} onChange={(e) => set(value.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="icon" onClick={() => set(value.filter((_, j) => j !== i))} aria-label={`Remove ${label} ${i + 1}`}>
            <X size={14} />
          </button>
        </div>
      ))}
      <button className="link" onClick={() => set([...value, ""])}>
        <Plus size={12} /> add
      </button>
    </div>
  );

  return (
    <DecisionBox
      title={`The Report, turn ${state.turn}`}
      note={
        <RuleNote source="Part X, 8">
          Turn header: one sentence on where things stand. One paragraph per action: the outcome as fact, its friction, at least one hook. Crumbs for every
          private outcome. The Clock: one line if an Escalation landed. Closing observation: one open thread no single faction owns. After each paragraph, ask:
          does this put something in front of me or an AA that changes the next turn?
        </RuleNote>
      }
    >
      <Field label="Turn header">
        <input value={header} onChange={(e) => setHeader(e.target.value)} />
      </Field>
      {list("Paragraphs", paragraphs, setParagraphs, 3)}
      {list("Crumbs", crumbs, setCrumbs)}
      <Field label="The Clock (if an Escalation landed)">
        <textarea value={clockLine} rows={2} onChange={(e) => setClockLine(e.target.value)} />
      </Field>
      <Field label="Closing observation">
        <textarea value={closing} rows={2} onChange={(e) => setClosing(e.target.value)} />
      </Field>
      {list("New threads (hooks for later turns)", threads, setThreads, 1)}
      <button
        className="primary"
        disabled={!header.trim() || !closing.trim()}
        onClick={() =>
          run({
            type: "publishReport",
            report: {
              header,
              paragraphs: paragraphs.filter((p) => p.trim()),
              crumbs: crumbs.filter((c) => c.trim()),
              ...(clockLine.trim() ? { clockLine } : {}),
              closing
            },
            threads: threads.filter((t) => t.trim()).map((text) => ({ text, facts: [] }))
          })
        }
      >
        Publish the Report and close the turn
      </button>
    </DecisionBox>
  );
}
