import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

/**
 * Tests de integración contra PostgreSQL real (docs/05-testing-strategy.md §5).
 * El contenedor lo levanta `test/global-setup.ts`: uno por corrida, no por archivo.
 */
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
    include: ["test/integration/**/*.int-spec.ts"],
    // Mismo motivo que en `vitest.config.ts`: los errores provocados a propósito no deben
    // ensuciar la salida, o el ruido esconde los fallos de verdad.
    env: { LOG_LEVEL: process.env.LOG_LEVEL ?? "silent" },
    globalSetup: ["./test/global-setup.ts"],
    // Arrancar el contenedor y aplicar migraciones tarda; los tests en sí son rápidos.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Un solo proceso: todos comparten la misma base y así el orden es predecible.
    fileParallelism: false,
  },
});
