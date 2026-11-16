import type { Debrief as DebriefData, GameEvent, GameState } from "@osg/engine";
import { useMemo, useState } from "react";
import { Field, RuleNote } from "../components/common";
import { nameOf } from "../components/game-bits";
import { gameStats } from "../session/stats";
import type { Run } from "../turn/shared";

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");

/** solo_mode.qmd Part XI, The Debrief: the closing frame, four questions, and the game's numbers. */
export function Debrief({ state, log, run }: { state: GameState; log: readonly GameEvent[]; run: Run }) {
  const saved = state.debrief;
  const [d, setD] = useState<DebriefData>(
    saved ?? { closingFrame: Object.fromEntries(state.standing.map((id) => [id, ""])), objectives: "", aaObjectives: "", surprise: "", design: "" }
  );
  const stats = useMemo(() => gameStats(log, state.player), [log, state.player]);
  const text = (key: Exclude<keyof DebriefData, "closingFrame">, label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <textarea rows={3} value={d[key]} onChange={(e) => setD({ ...d, [key]: e.target.value })} />
    </Field>
  );

  return (
    <section className="step-view">
      <h2>Debrief</h2>
      <RuleNote source="Part XI">
        A solo game that produced no surprises had AA tables that were too predictable or a Clock that was too slow. A game that felt incoherent had a Problem that
        did not generate distinct competing interests.
      </RuleNote>

      <h3>Closing frame: where each faction ends</h3>
      {state.standing.map((id) => (
        <Field key={id} label={nameOf(state, id)}>
          <input value={d.closingFrame[id] ?? ""} onChange={(e) => setD({ ...d, closingFrame: { ...d.closingFrame, [id]: e.target.value } })} />
        </Field>
      ))}

      {text("objectives", "1. Your objectives", "Did you achieve the short-term one? Did you achieve or lay groundwork for the long-term one? Why?")}
      {text("aaObjectives", "2. The AAs' objectives", "Did each AA get what it wanted? Answer from the fiction; if it doesn't settle it, ask the Oracle at Even. Compare your result with theirs.")}
      {text("surprise", "3. The surprise", "Which turn surprised you most, and what produced it: an AA, the Clock, a Secret, or your own action's consequences?")}
      {text("design", "4. The design", "What would you change: the Problem, an AA's behavior or table, the Clock?")}
      <button className="primary" onClick={() => run({ type: "writeDebrief", debrief: d })}>
        {saved ? "Save the Debrief again" : "Save the Debrief"}
      </button>

      <h3>The game in numbers</h3>
      <table className="stats">
        <thead>
          <tr>
            <th>Faction</th>
            <th>Actions</th>
            <th title="Strong grades out of graded actions: the same checklist should grade every faction alike">Graded Strong</th>
            <th>Desired outcome</th>
            <th>Bonuses spent</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(stats.byFaction).map(([id, s]) => (
            <tr key={id} className={id === state.player ? "you" : undefined}>
              <td>{nameOf(state, id)}</td>
              <td>{s.actions}</td>
              <td>
                {s.strong}/{s.graded} ({pct(s.strong, s.graded)})
              </td>
              <td>
                {s.desired}/{s.actions} ({pct(s.desired, s.actions)})
              </td>
              <td>{s.bonusesSpent}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim">
        Offers {stats.offers}, deals {stats.deals}, broken by AAs {stats.dealsBrokenByAA}, broken by you {stats.dealsBrokenByYou}. Secrets uncovered{" "}
        {stats.secretsUncovered}. Forces of Nature {stats.forcesOfNature}. Crisis Clock {state.clock.position}/{state.clock.length}
        {state.clock.escalations.find((e) => e.breakingPoint)?.landed ? ": the Breaking Point landed." : "."}
      </p>
    </section>
  );
}
