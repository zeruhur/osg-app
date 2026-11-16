/** A minimal reader for the Quarto Markdown rules files: heading paths, pipe tables, plain text.
 * Only what the drift test needs; not a Markdown parser. */

export interface QmdTable {
  header: string[];
  rows: string[][];
}

export interface QmdSection {
  /** Heading path, e.g. "Part VIII: Inspiration Tables > Friction". */
  path: string;
  /** Lines under the heading, up to the next heading of any level. */
  lines: string[];
}

/** Strips Markdown emphasis and a trailing hard-break backslash, and collapses whitespace. The
 * same cleaning the JSON was extracted with. */
export function clean(text: string): string {
  return text
    .trim()
    .replaceAll("**", "")
    .replace(/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, "$1")
    .replace(/\\$/, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalizes what a harmless edit could change: whitespace and dash variants. */
export function normalize(text: string): string {
  return clean(text).replace(/[‐-―−]/g, "-");
}

export function parseSections(text: string): QmdSection[] {
  const sections: QmdSection[] = [];
  const stack: { level: number; title: string }[] = [];
  let current: QmdSection | undefined;
  let inCode = false;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("```")) inCode = !inCode;
    const heading = inCode ? null : /^(#{1,6}) (.+?)\s*$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
      stack.push({ level, title: heading[2]! });
      current = { path: stack.map((s) => s.title).join(" > "), lines: [] };
      sections.push(current);
    } else {
      current?.lines.push(line);
    }
  }
  return sections;
}

/** The one section whose path is `heading` or ends with ` > heading`. */
export function findSection(sections: QmdSection[], heading: string): QmdSection {
  const matches = sections.filter((s) => s.path === heading || s.path.endsWith(` > ${heading}`));
  if (matches.length !== 1) {
    throw new Error(`Expected one section for "${heading}", found ${matches.length}: ${matches.map((m) => m.path).join(" | ")}`);
  }
  return matches[0]!;
}

/** The pipe tables directly under a section, in order. */
export function tablesIn(section: QmdSection): QmdTable[] {
  const tables: QmdTable[] = [];
  let current: QmdTable | undefined;
  for (const line of section.lines) {
    if (!line.startsWith("|")) {
      current = undefined;
      continue;
    }
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(clean);
    if (!current) {
      current = { header: cells, rows: [] };
      tables.push(current);
    } else if (!cells.every((c) => c === "" || /^:?-+:?$/.test(c))) {
      current.rows.push(cells);
    }
  }
  return tables;
}

/** The section's text, cleaned line by line and joined, for "does the prose still say this" checks. */
export function sectionText(section: QmdSection): string {
  return normalize(section.lines.filter((l) => !l.startsWith("|")).map(clean).join(" "));
}
