import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CLAUDE.md / docs/phase-1-engine.md section 0: packages/engine has no IO, no clock and no global
// randomness. This scans the source (not the tests) so a violation fails CI.
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? sources(join(dir, d.name)) : d.name.endsWith(".ts") && !d.name.endsWith(".test.ts") ? [join(dir, d.name)] : []
  );
}

const FORBIDDEN: [RegExp, string][] = [
  [/\bMath\.random\b/, "Math.random: roll through the injected Rng"],
  [/\bDate\.now\b|\bnew Date\b|\bperformance\.now\b/, "the clock: time is not game state"],
  [/\bcrypto\b/, "crypto: randomness goes through the Rng"],
  [/from\s+["']node:|require\(/, "Node built-ins: the engine has no IO"],
  [/\bfetch\(|\bXMLHttpRequest\b|\blocalStorage\b/, "network or storage IO"],
  [/from\s+["'](?!\.{1,2}\/|@osg\/dice["']|@osg\/rules-data["']|zod["'])/, "imports other than @osg/dice, @osg/rules-data, zod and local modules"]
];

describe("engine purity", () => {
  const files = sources(SRC);

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(SRC.length).replaceAll("\\", "/"), f]))("%s uses no IO, clock or global randomness", (_, file) => {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const [re, why] of FORBIDDEN) expect(code, why).not.toMatch(re);
  });
});
