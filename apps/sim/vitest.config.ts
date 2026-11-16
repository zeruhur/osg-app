import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@osg/sim",
    include: ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 120000
  }
});
