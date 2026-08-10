import { defineConfig } from "vitest/config";

// docs/05-testing-strategy.md §7 — flujos críticos completos contra Postgres real (Testcontainers).
export default defineConfig({
  test: {
    include: ["src/**/*.e2e-spec.ts"],
    testTimeout: 30_000,
  },
});
