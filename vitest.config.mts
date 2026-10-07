import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    env: { UNIFLOW_DATA_MODE: "memory", AGENT_MODE: "scripted", UNIFLOW_DISABLE_PERSIST: "1", SANDBOX_LATENCY_MS: "0" },
  },
});
