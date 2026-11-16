import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const docs = fileURLToPath(new URL("../rules/osg/docs/", import.meta.url));

describe("rules/osg submodule", () => {
  it("is checked out", () => {
    for (const file of ["solo_mode.qmd", "contested_ground.qmd", "osg_handbook.qmd", "factionlog.qmd"]) {
      expect(existsSync(docs + file), `missing rules/osg/docs/${file}; run git submodule update --init`).toBe(true);
    }
  });

  it("is pinned at or after 0d96334 (Schemer deal check in Appendix B)", () => {
    const solo = readFileSync(docs + "solo_mode.qmd", "utf8");
    expect(solo).toContain("? Does Meranto keep the deal? (Likely)");
  });
});
