import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "@osg/dice",
    include: ["src/**/*.test.ts"],
    environment: "node",
    restoreMocks: true
  }
});
