import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["../../tests/api/**/*.test.ts"],
    // Several suites exercise real I/O (a loopback HTTP server, a spawned Node
    // process, SDK transports) and take seconds even on an idle machine, so the
    // 5s default fails them whenever the CPU is busy. The integration config
    // already raises these for the same reason.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
  esbuild: {
    target: "node18",
  },
});
