import {
  STANDARD_LEVERAGE,
  behaviorRules,
  core,
  disposition,
  generator,
  genericActions,
  genericSecrets,
  inspiration,
  offerResults,
  packs,
  signals,
  type ScenarioPack
} from "../src/index";
import { findSection, normalize, parseSections, sectionText, tablesIn, type QmdSection } from "./qmd";

/** One difference between the JSON and the rules text. */
export interface Mismatch {
  check: string;
  heading: string;
  detail: string;
  expected?: string;
  actual?: string;
}

interface Source {
  heading: string;
  table: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const range = (min: number, max: number) => (min === max ? String(min) : `${min}–${max}`);

/** Compares every Solo Mode table and prose field the JSON copies against `solo_mode.qmd` text.
 * Returns the differences; an empty list means the JSON matches upstream. */
export function drift(soloText: string): Mismatch[] {
  const sections = parseSections(soloText);
  const out: Mismatch[] = [];

  const section = (check: string, heading: string): QmdSection | undefined => {
    try {
      return findSection(sections, heading);
    } catch (e) {
      out.push({ check, heading, detail: (e as Error).message });
      return undefined;
    }
  };

  const table = (check: string, src: Source) => {
    const s = section(check, src.heading);
    if (!s) return undefined;
    const t = tablesIn(s)[src.table];
    if (!t) out.push({ check, heading: src.heading, detail: `no table #${src.table}` });
    return t;
  };

  const same = (check: string, heading: string, detail: string, expected: string, actual: string | undefined) => {
    if (actual === undefined || normalize(expected) !== normalize(actual)) {
      out.push({ check, heading, detail, expected, actual: actual ?? "(missing)" });
    }
  };

  /** Whole rows: the JSON gives every cell of every row, in order. */
  const rows = (check: string, src: Source, expected: string[][], header?: string[]) => {
    const t = table(check, src);
    if (!t) return;
    if (header) header.forEach((h, i) => same(check, src.heading, `header column ${i}`, h, t.header[i]));
    if (t.rows.length !== expected.length) {
      out.push({ check, heading: src.heading, detail: `row count`, expected: String(expected.length), actual: String(t.rows.length) });
    }
    expected.forEach((row, r) =>
      row.forEach((cell, c) => same(check, src.heading, `row ${r + 1}, column ${c + 1}`, cell, t.rows[r]?.[c]))
    );
  };

  /** One named column of a multi-column table, keyed by the first column (d6) or by the column
   * just before it (the d66 | name | d66 | name layout). */
  const column = (check: string, src: Source, name: string, key: "first" | "previous", expected: [string, string][]) => {
    const t = table(check, src);
    if (!t) return;
    const c = t.header.findIndex((h) => normalize(h) === normalize(name));
    if (c < 0) {
      out.push({ check, heading: src.heading, detail: `no column "${name}"`, actual: t.header.join(" | ") });
      return;
    }
    const k = key === "first" ? 0 : c - 1;
    if (t.rows.length !== expected.length) {
      out.push({ check, heading: src.heading, detail: `row count`, expected: String(expected.length), actual: String(t.rows.length) });
    }
    expected.forEach(([keyCell, cell], r) => {
      same(check, src.heading, `${name}, row ${r + 1} key`, keyCell, t.rows[r]?.[k]);
      same(check, src.heading, `${name}, row ${r + 1}`, cell, t.rows[r]?.[c]);
    });
  };

  /** Prose: the section must still contain this text. */
  const says = (check: string, heading: string, text: string) => {
    const s = section(check, heading);
    if (s && !sectionText(s).includes(normalize(text))) {
      out.push({ check, heading, detail: "text not found in section", expected: text });
    }
  };

  // ---------- core.json ----------
  rows("core.leverage", core.leverage.source, core.leverage.rows.map((r) => [cap(r.grade), r.text]), ["Leverage", "Keep"]);
  rows("core.results", core.results.source, core.results.rows.map((r) => [r.label, r.text]), ["Result", "Outcome"]);
  rows("core.oracleOdds", core.oracleOdds.source, core.oracleOdds.rows.map((r) => [r.name, r.rollText, r.yes]));
  rows("core.oracleAnswers", core.oracleAnswers.source, core.oracleAnswers.rows.map((r) => [String(r.face), r.text]));

  // ---------- single tables ----------
  rows("behavior-rules", behaviorRules.source, behaviorRules.rows.map((r) => [String(r.face), r.name, r.rule]));
  rows(
    "disposition",
    disposition.source,
    disposition.rows.map((r) => [r.name, r.offers, r.targeting, r.keepingDeals]),
    ["Disposition", "Offers", "Targeting", "Keeping deals"]
  );
  rows("offer-results", offerResults.source, offerResults.rows.map((r) => [r.answer, r.result]));
  rows(
    "signals",
    signals.source,
    signals.rows.map((r) => [range(r.min, r.max), r.text ? `${r.name}. ${r.text}` : r.name])
  );

  // ---------- by leverage ----------
  for (const l of STANDARD_LEVERAGE) {
    for (const [file, data] of [
      ["secrets-generic", genericSecrets],
      ["aa-actions-generic", genericActions]
    ] as const) {
      const t = data[l];
      column(`${file}.${l}`, t.source, t.column, "first", t.entries.map((e, i) => [String(i + 1), e]));
    }
  }

  // ---------- inspiration.json ----------
  for (const [name, t] of Object.entries(inspiration)) {
    rows(`inspiration.${name}`, t.source, t.rows.map((r) => [String(r.face), r.text]), ["d6", t.column]);
  }

  // ---------- generator.json ----------
  for (const [name, cats] of [
    ["event", generator.event],
    ["absence", generator.absence],
    ["archetype", generator.archetype]
  ] as const) {
    for (const c of cats) {
      column(`generator.${name}.${c.category}`, c.source, c.category, "previous", c.rows.map((r) => [String(r.roll), r.text]));
    }
  }
  const faceText = (rs: { face: number; text: string }[]) => rs.map((r) => [String(r.face), r.text]);
  rows("generator.stake", generator.stake.source, faceText(generator.stake.rows));
  rows("generator.vulnerability", generator.vulnerability.source, faceText(generator.vulnerability.rows));
  rows("generator.tie", generator.tie.source, faceText(generator.tie.rows), ["d6", generator.tie.column]);
  rows("generator.location", generator.location.source, faceText(generator.location.rows));
  rows(
    "generator.escalation",
    generator.escalation.source,
    generator.escalation.rows.map((r) => [String(r.face), `${r.name}: ${r.text}`])
  );
  rows(
    "generator.stance",
    generator.stance.source,
    generator.stance.rows.map((r) => [String(r.face), `${r.name}: ${r.description}`, r.shortTerm, r.longTerm, cap(r.behavior)])
  );
  says(
    "generator.secondaryLeverage",
    generator.secondaryLeverage.source.heading,
    `${generator.secondaryLeverage.source.paragraph} ` +
      generator.secondaryLeverage.rows.map((r) => `${r.face} ${cap(r.leverage)}`).join(", ") +
      "."
  );

  // ---------- packs ----------
  for (const pack of Object.values(packs)) packDrift(pack, out, { rows, says, table, same });

  return out;
}

interface Helpers {
  rows: (check: string, src: Source, expected: string[][], header?: string[]) => void;
  says: (check: string, heading: string, text: string) => void;
  table: (check: string, src: Source) => { header: string[]; rows: string[][] } | undefined;
  same: (check: string, heading: string, detail: string, expected: string, actual: string | undefined) => void;
}

function packDrift(pack: ScenarioPack, out: Mismatch[], h: Helpers): void {
  const A = pack.source.heading;
  const at = (sub: string) => `${A} > ${sub}`;
  const name = (id: string) => pack.factions.find((f) => f.id === id)?.name ?? id;
  const p = `packs/${pack.id}`;

  h.says(`${p}.problem`, at("The Problem"), pack.problem);
  h.says(`${p}.world`, at("The World"), pack.world);
  pack.turnZero.forEach((t, i) => h.says(`${p}.turnZero[${i}]`, at("Turn Zero: Established"), t));
  h.says(`${p}.unsettled`, at("Turn Zero: Established"), pack.unsettled.join("; "));

  h.rows(`${p}.map`, { heading: at("The Map"), table: 0 }, pack.map.map((l) => [l.name, l.notes]));
  h.rows(
    `${p}.clock`,
    { heading: at("The Crisis Clock"), table: 0 },
    pack.clock.escalations.map((e) => [String(e.box), `${e.title}. ${e.text}`])
  );

  for (const v of pack.variants) {
    h.says(`${p}.variants.${v.id}.standing`, at("Starting Standing"), v.standing.map(name).join(" > "));
  }

  // Starting disposition matrix: header and row labels are the faction ids, capitalized.
  const matrix = h.table(`${p}.startingDisposition`, { heading: at("Starting Disposition"), table: 0 });
  if (matrix) {
    const cols = matrix.header.slice(1).map((c) => c.toLowerCase());
    for (const row of matrix.rows) {
      const aa = row[0]!.toLowerCase();
      cols.forEach((you, i) => {
        const expected = aa === you ? "n/a" : cap(pack.startingDisposition[aa]?.[you] ?? "(missing)");
        h.same(`${p}.startingDisposition`, at("Starting Disposition"), `${aa} toward ${you}`, expected, row[i + 1]);
      });
    }
    if (matrix.rows.length !== pack.factions.length) {
      out.push({ check: `${p}.startingDisposition`, heading: at("Starting Disposition"), detail: "row count" });
    }
  }

  for (const f of pack.factions) {
    const heading = f.asAA.source.heading;
    const fp = `${p}.factions.${f.id}`;
    const bonus = (b: { name: string; uses: number; text?: string | undefined }) =>
      `${b.name} (${b.uses}x).${b.text ? ` ${b.text}` : ""}`;

    h.says(`${fp}.public`, heading, `Public: ${f.public}`);
    h.says(`${fp}.asPlayer.shortTerm`, heading, `Short-term: ${f.asPlayer.shortTerm}`);
    h.says(`${fp}.asPlayer.longTerm`, heading, `Long-term: ${f.asPlayer.longTerm}`);
    f.asPlayer.position.forEach((pos, i) => h.says(`${fp}.asPlayer.position[${i}]`, heading, pos));
    h.says(`${fp}.asPlayer.bonus`, heading, `Bonus: ${bonus(f.asPlayer.bonus)}`);

    const aa = f.asAA;
    const lev = cap(aa.leverage.primary) + (aa.leverage.secondary ? ` (secondary: ${aa.leverage.secondary})` : "");
    h.rows(`${fp}.asAA`, { heading, table: 0 }, [
      ["Objective", aa.objective],
      ["Position", aa.position],
      ["Leverage", lev],
      ["Behavior", cap(aa.behavior)],
      ...(aa.bonus ? [["Bonus", `${aa.bonus.name} (${aa.bonus.uses}x)`]] : [])
    ]);
    h.rows(`${fp}.actionTable`, { heading, table: 1 }, aa.actionTable.map((e, i) => [String(i + 1), e]), ["d6", "Action"]);
    h.rows(`${fp}.secretTable`, { heading, table: 2 }, aa.secretTable.map((e, i) => [String(i + 1), e]));
  }
}
