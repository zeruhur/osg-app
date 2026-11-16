import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "workspace",
          include: ["test/**/*.test.ts"],
          environment: "node"
        }
      },
      "packages/*",
      "apps/*"
    ]
  }
});
