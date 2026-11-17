import type { ActionState, Command, Fact, FactionId, GameState } from "@osg/engine";
import { useState, type ReactNode } from "react";
import { nameOf } from "../components/game-bits";

export type Run = (command: Command) => Promise<boolean>;

/** The facts a faction may cite: public ones, its own private ones, and private ones it has learned. */
export function citableFacts(state: GameState, faction: FactionId): Fact[] {
  return Object.values(state.facts).filter(
    (f) =>
      f.visibility.kind === "public" ||
      (f.visibility.kind === "private" && f.visibility.faction === faction) ||
      (f.visibility.kind === "player-only" && faction === state.player) ||
      f.knownBy.includes(faction)
  );
}

/** Pick facts to cite. */
export function FactPicker(props: { state: GameState; faction: FactionId; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const facts = citableFacts(props.state, props.faction);
  return (
    <div className="fact-picker">
      <button type="button" className="link" onClick={() => setOpen(!open)}>
        {open ? "Hide facts" : `Cite facts (${props.value.length} cited)`}
      </button>
      {open && (
        <ul className="fact-list">
          {facts.map((f) => (
            <li key={f.id}>
              <label>
                <input
                  type="checkbox"
                  checked={props.value.includes(f.id)}
                  onChange={(e) => props.onChange(e.target.checked ? [...props.value, f.id] : props.value.filter((x) => x !== f.id))}
                />
                <span>
                  {f.text}
                  <span className="fact-meta">
                    {f.visibility.kind === "public" ? "public" : "private"}
                    {f.status === "rumor" ? " · rumor" : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Checkboxes for a set of factions. */
export function FactionChecks(props: { state: GameState; options: FactionId[]; value: FactionId[]; onChange: (v: FactionId[]) => void }) {
  return (
    <div className="checks">
      {props.options.map((id) => (
        <label key={id} className="check">
          <input
            type="checkbox"
            checked={props.value.includes(id)}
            onChange={(e) => props.onChange(e.target.checked ? [...props.value, id] : props.value.filter((x) => x !== id))}
          />
          {nameOf(props.state, id)}
        </label>
      ))}
    </div>
  );
}

/** An action, read-only: Action / Outcome / Leverage and its flags. */
export function ActionCard({ state, action, extra }: { state: GameState; action: ActionState; extra?: ReactNode }) {
  const who = action.participants.map((p) => nameOf(state, p)).join(" + ");
  return (
    <article className={`action-card${action.faction === state.player ? " mine" : ""}`}>
      <header>
        <strong>{who}</strong>
        {action.source === "hold" && <span className="badge">holds</span>}
        {action.source === "obligation" && <span className="badge">deal obligation</span>}
        {action.source === "exploit" && <span className="badge">exploits a broken deal</span>}
        {action.covert && <span className="badge">covert</span>}
        {action.bonus && <span className="badge accent">{action.bonus}</span>}
        {action.targets.length > 0 && <span className="dim"> → {action.targets.map((t) => nameOf(state, t)).join(", ")}</span>}
      </header>
      <dl>
        <dt>Action</dt>
        <dd>{action.act}</dd>
        <dt>Outcome</dt>
        <dd>{action.out}</dd>
        <dt>Leverage</dt>
        <dd>{action.lev}</dd>
      </dl>
      {action.investigates && <p className="dim">Investigates {nameOf(state, action.investigates)}</p>}
      {extra}
    </article>
  );
}

/** A decision panel: a titled box around one form. */
export function DecisionBox({ title, children, note }: { title: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="decision">
      <h3>{title}</h3>
      {note && <div className="decision-note">{note}</div>}
      {children}
    </section>
  );
}

/** Act / Outcome / Leverage fields. */
export interface AolValue {
  act: string;
  out: string;
  lev: string;
}

export function AolFields({ value, onChange }: { value: AolValue; onChange: (v: AolValue) => void }) {
  return (
    <>
      <label className="field">
        <span>Action: what specifically is the faction doing?</span>
        <textarea value={value.act} onChange={(e) => onChange({ ...value, act: e.target.value })} rows={2} />
      </label>
      <label className="field">
        <span>Outcome: what result does it want?</span>
        <textarea value={value.out} onChange={(e) => onChange({ ...value, out: e.target.value })} rows={2} />
      </label>
      <label className="field">
        <span>Leverage: why should this work? Ground it in established fiction.</span>
        <textarea value={value.lev} onChange={(e) => onChange({ ...value, lev: e.target.value })} rows={2} />
      </label>
    </>
  );
}

export const aolFilled = (v: AolValue) => !!(v.act.trim() && v.out.trim() && v.lev.trim());
