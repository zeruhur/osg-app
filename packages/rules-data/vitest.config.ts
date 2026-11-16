import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@osg/rules-data",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node"
  }
});
