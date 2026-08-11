import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";


// docs/01-architecture.md §6 — una prueba de aislamiento de tenant por cada ruta registrada.
// ADR-014 punto 3: ruta sin su prueba de aislamiento → falla el build.
export default defineConfig({
  // Mismo motivo que en `vitest.config.ts`: sin esto, NestJS no puede resolver dependencias.
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    // Viven en `test/isolation/`, no en `src/`: son pruebas de la aplicación armada, no
    // unitarias de un archivo.
    include: ["test/isolation/**/*.isolation-spec.ts"],
    testTimeout: 30_000,
    globalSetup: ["./test/global-setup.ts"],
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? "silent" },
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
