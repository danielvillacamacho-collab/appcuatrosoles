import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import type { GlobalSetupContext } from "vitest/node";

/**
 * Levanta un PostgreSQL 16 real para los tests de integración y le aplica las migraciones
 * (docs/05-testing-strategy.md §5). No se mockea la base: la mitad de los invariantes de este
 * proyecto viven en constraints, triggers y `EXCLUDE` — un mock probaría que el mock funciona.
 *
 * Un contenedor por **corrida**, no por archivo: arrancar Postgres cuesta segundos y los tests
 * se escriben para no depender de una tabla vacía (ver §"Aislamiento" en docs/05).
 *
 * Contenedor nuevo cada vez, además, por una razón concreta descubierta en T-004: `audit_log`
 * es append-only, así que un test que escriba ahí **no puede limpiar lo que escribió**. La
 * única forma de partir de cero es una base nueva.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_API = resolve(AQUI, "..");

let contenedor: StartedTestContainer | undefined;

export async function setup({ provide }: GlobalSetupContext): Promise<void> {
  console.warn("[tests] levantando PostgreSQL 16 en un contenedor…");

  contenedor = await new GenericContainer("postgres:16")
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "polo_test",
    })
    .withExposedPorts(5432)
    // El mensaje aparece dos veces al arrancar Postgres (una en la inicialización y otra
    // cuando queda realmente escuchando); esperar la segunda evita conectarse demasiado pronto.
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  const url = `postgresql://test:test@${contenedor.getHost()}:${contenedor.getMappedPort(5432)}/polo_test`;

  console.warn("[tests] aplicando migraciones…");
  execFileSync(resolve(RAIZ_API, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: RAIZ_API,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  provide("databaseUrl", url);
  console.warn("[tests] base de datos lista.");
}

export async function teardown(): Promise<void> {
  await contenedor?.stop();
}
