import { defineConfig } from "vitest/config";

/**
 * Tests de integración contra PostgreSQL real (docs/05-testing-strategy.md §5).
 * El contenedor lo levanta `test/global-setup.ts`: uno por corrida, no por archivo.
 */
export default defineConfig({
  test: {
    include: ["test/integration/**/*.int-spec.ts"],
    // Mismo motivo que en `vitest.config.ts`: los errores provocados a propósito no deben
    // ensuciar la salida, o el ruido esconde los fallos de verdad.
    env: { LOG_LEVEL: "silent" },
    globalSetup: ["./test/global-setup.ts"],
    // Arrancar el contenedor y aplicar migraciones tarda; los tests en sí son rápidos.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Un solo proceso: todos comparten la misma base y así el orden es predecible.
    fileParallelism: false,
  },
});
