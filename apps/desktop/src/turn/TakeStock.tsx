import type { GameState } from "@osg/engine";
import { DispositionBadge, nameOf } from "../components/game-bits";

/** Step 1 (solo_mode.qmd Part X, 1): read the last Report; check Standing, Deals and the Clock. */
export function TakeStock({ state }: { state: GameState }) {
  const report = state.reports[state.turn - 1];
  const deals = Object.values(state.deals).filter((d) => d.status === "active");
  const threads = Object.values(state.threads).filter((t) => t.closed === undefined);
  const landed = state.clock.escalations.filter((e) => e.landed);
  return (
    <div className="stock">
      {report ? <ReportView report={report} turn={state.turn - 1} /> : <p className="dim">The first turn: the last Report is the scenario itself.</p>}

      <h3>The Autonomous Actors</h3>
      <ul className="aa-list">
        {Object.values(state.aa).map((aa) => (
          <li key={aa.faction}>
            <strong>{nameOf(state, aa.faction)}</strong> <DispositionBadge value={aa.disposition} />
            <span className="badge">{aa.behavior}</span>
            <div className="dim">{aa.objective}</div>
          </li>
        ))}
      </ul>

      <h3>Deals</h3>
      {deals.length ? (
        <ul>
          {deals.map((d) => (
            <li key={d.id}>
              {d.parties.map((p) => nameOf(state, p)).join(" / ")}: {d.terms}
              <span className="dim">
                {" "}
                (since turn {d.since}
                {d.until !== undefined ? `, until turn ${d.until}` : ""})
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dim">No deals in force.</p>
      )}

      {landed.length > 0 && (
        <>
          <h3>Escalations</h3>
          <ul>
            {landed.map((e) => (
              <li key={e.box}>
                <strong>{e.title}.</strong> {e.text}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Open threads</h3>
      {threads.length ? (
        <ol>
          {threads.map((t) => (
            <li key={t.id}>{t.text}</li>
          ))}
        </ol>
      ) : (
        <p className="dim">None yet.</p>
      )}
    </div>
  );
}

export function ReportView({ report, turn }: { report: GameState["reports"][number]; turn: number }) {
  return (
    <article className="report">
      <h3>Report, turn {turn}</h3>
      <p className="report-header">{report.header}</p>
      {report.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {report.crumbs.map((c, i) => (
        <p key={`c${i}`} className="crumb">
          {c}
        </p>
      ))}
      {report.clockLine && <p className="clock-line">{report.clockLine}</p>}
      <p className="report-closing">{report.closing}</p>
    </article>
  );
}
