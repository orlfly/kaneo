import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["../../tests/api-integration/**/*.test.ts"],
    setupFiles: ["../../tests/api-integration/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    coverage: {
      enabled: false,
    },
  },
  esbuild: {
    target: "node18",
  },
});
