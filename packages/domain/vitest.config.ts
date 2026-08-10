import { defineConfig } from "vitest/config";

// Umbral de packages/domain: 85% (docs/05-testing-strategy.md §2).
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      // Ojo: declarar `exclude` reemplaza los patrones por defecto de Vitest (no los
      // extiende) — por eso se repiten aquí explícitamente en vez de sólo agregar el propio.
      exclude: [
        "coverage/**",
        "dist/**",
        "**/*.d.ts",
        "**/*.{test,spec}.?(c|m)[jt]s?(x)",
        "**/__tests__/**",
        "**/*.config.*",
        "src/index.ts", // barril: sólo re-exporta, no hay lógica que probar (docs/05 §9).
      ],
      thresholds: {
        lines: 85,
        statements: 85,
        branches: 80,
        functions: 85,
      },
    },
  },
});
