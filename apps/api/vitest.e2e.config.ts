import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";


// docs/05-testing-strategy.md §7 — flujos críticos completos contra Postgres real (Testcontainers).
export default defineConfig({
  // Mismo motivo que en `vitest.config.ts`: sin esto, NestJS no puede resolver dependencias.
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/e2e/**/*.e2e-spec.ts"],
    testTimeout: 30_000,
    globalSetup: ["./test/global-setup.ts"],
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? "silent" },
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
