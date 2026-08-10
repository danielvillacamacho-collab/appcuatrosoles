import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      // Ojo: declarar `exclude` reemplaza los patrones por defecto de Vitest (no los
      // extiende) — por eso se repiten aquí explícitamente en vez de sólo agregar los propios.
      exclude: [
        "coverage/**",
        "dist/**",
        "**/*.d.ts",
        "**/*.{test,spec}.?(c|m)[jt]s?(x)",
        "**/__tests__/**",
        "**/*.config.*",
        "src/main.ts", // bootstrap puro (docs/05 §9: no hay lógica de negocio que probar).
        "**/*.module.ts", // wiring de NestJS: metadata declarativa, sin lógica ejecutable.
      ],
      thresholds: { lines: 50, statements: 50, branches: 50, functions: 50 },
    },
  },
});
