import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { drift, type Mismatch } from "./drift";
import { clean, findSection, parseSections, tablesIn } from "./qmd";

// The JSON in data/ copies text from the pinned rules submodule. This test fails when the two
// diverge: after a submodule bump that changed a table, or a hand edit to the JSON.
const SOLO = fileURLToPath(new URL("../../../rules/osg/docs/solo_mode.qmd", import.meta.url));
const present = existsSync(SOLO);

const report = (ms: Mismatch[]) =>
  ms
    .map((m) => `- [${m.check}] ${m.heading}: ${m.detail}` + (m.expected !== undefined ? `\n    json: ${m.expected}\n    qmd:  ${m.actual ?? ""}` : ""))
    .join("\n");

describe("drift between data/ and rules/osg/docs/solo_mode.qmd", () => {
  it.runIf(!present && process.env.CI)("has the rules submodule checked out in CI", () => {
    expect.fail(`missing ${SOLO}: CI must check out submodules`);
  });

  it.skipIf(!present)("finds no differences", () => {
    const mismatches = drift(readFileSync(SOLO, "utf8"));
    expect(mismatches, `rules-data no longer matches solo_mode.qmd:\n${report(mismatches)}`).toEqual([]);
  });

  it.skipIf(!present)("catches a changed table cell (meta-test)", () => {
    const text = readFileSync(SOLO, "utf8");
    const edited = text.replace("| 2  | Cost more than planned", "| 2  | Cost far more than planned");
    expect(edited).not.toBe(text);
    const mismatches = drift(edited);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatchObject({
      check: "inspiration.friction",
      expected: "Cost more than planned",
      actual: "Cost far more than planned"
    });
  });

  it.skipIf(!present)("catches an added row, a renamed heading, and changed prose", () => {
    const text = readFileSync(SOLO, "utf8");
    const checks: [string, string, string][] = [
      ["| 6  | Is incomplete: one piece remains, to be finished later                |", "$&\n| 7 | Extra |", "inspiration.friction"],
      ["### Behavior Rules", "### Behaviour Rules", "behavior-rules"],
      ["She died twelve days ago", "She died ten days ago", "packs/corentine.world"]
    ];
    for (const [from, to, check] of checks) {
      expect(text.includes(from), from).toBe(true);
      expect(drift(text.replace(from, to)).map((m) => m.check)).toContain(check);
    }
  });
});

describe("qmd reader", () => {
  it("strips emphasis and hard breaks", () => {
    expect(clean("  **Strong**   keeps *the* higher\\ ")).toBe("Strong keeps the higher");
    expect(clean("2d6, keep the **higher**")).toBe("2d6, keep the higher");
  });

  it("finds tables by heading path and ignores separator rows", () => {
    const sections = parseSections("# A\n## B\n\n| x | y |\n| :- | :- |\n| 1 | **one** |\n\ntext\n\n| z |\n| - |\n| 2 |\n## C\n");
    const tables = tablesIn(findSection(sections, "B"));
    expect(tables).toEqual([
      { header: ["x", "y"], rows: [["1", "one"]] },
      { header: ["z"], rows: [["2"]] }
    ]);
    expect(findSection(sections, "A > B").path).toBe("A > B");
  });

  it("ignores headings inside code blocks", () => {
    const sections = parseSections("## Real\n```\n## Fake\n```\n");
    expect(sections.map((s) => s.path)).toEqual(["Real"]);
  });
});
