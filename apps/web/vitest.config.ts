import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // A few component suites wait on real timers and user-driven settling, and
    // cross the 5s default when the machine is busy; that showed up as random
    // failures in whichever file happened to be slowest.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@i18n": path.resolve(__dirname, "../../i18n"),
    },
  },
});
