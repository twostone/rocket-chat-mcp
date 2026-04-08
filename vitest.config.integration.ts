import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.integration.test.ts"],
    globalSetup: ["tests/integration/setup/global.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
    pool: "forks",
  },
});
