import { defineConfig } from "vitest/config";

// docs/01-architecture.md §6 — una prueba de aislamiento de tenant por cada ruta registrada.
// ADR-014 punto 3: ruta sin su prueba de aislamiento → falla el build.
export default defineConfig({
  test: {
    include: ["src/**/*.isolation-spec.ts"],
  },
});
