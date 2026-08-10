import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    // Los tests del filtro de errores provocan 500 a propósito; sin esto, cada corrida escupe
    // trazas de errores esperados y el ruido esconde los fallos de verdad.
    env: { LOG_LEVEL: "silent" },
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
        // `test/` es el andamiaje de pruebas (contenedor, cliente Prisma, tests de
        // integración), no código de producción. Excluirlo **acota qué se mide**; no baja
        // ningún umbral, que sigue en 50 % (CLAUDE.md regla 12). Su propio correcto
        // funcionamiento se comprueba porque los tests de integración pasan o fallan.
        "test/**",
        // El seed es un script que corre una persona a mano, no código del servidor. Su
        // comportamiento sí está cubierto, pero por la suite de integración
        // (`test/integration/seed.int-spec.ts`), que no participa de esta medición.
        "prisma/**",
      ],
      thresholds: { lines: 50, statements: 50, branches: 50, functions: 50 },
    },
  },
});
