import { defineConfig } from "vitest/config";

/**
 * Tests de integración contra PostgreSQL real (docs/05-testing-strategy.md §5).
 * El contenedor lo levanta `test/global-setup.ts`: uno por corrida, no por archivo.
 */
export default defineConfig({
  test: {
    include: ["test/integration/**/*.int-spec.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Arrancar el contenedor y aplicar migraciones tarda; los tests en sí son rápidos.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Un solo proceso: todos comparten la misma base y así el orden es predecible.
    fileParallelism: false,
  },
});
