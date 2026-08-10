import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // NestJS resuelve las dependencias del constructor leyendo la metadata que emite
  // `emitDecoratorMetadata`, y **esbuild —el transpilador por defecto de Vitest— no la emite**.
  // Sin este plugin, un `constructor(private readonly prisma: PrismaService)` compila, arranca y
  // deja la dependencia en `undefined`: en producción funciona (lo compila `tsc` vía `nest build`)
  // y en los tests revienta con un TypeError que no dice nada. La alternativa era anotar cada
  // parámetro con `@Inject(...)` a mano en todo el proyecto, y eso convierte un olvido en un `500`
  // en producción. Se arregla la herramienta, no el código.
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.spec.ts"],
    // Los tests del filtro de errores provocan 500 a propósito; sin esto, cada corrida escupe
    // trazas de errores esperados y el ruido esconde los fallos de verdad.
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? "silent" },
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
