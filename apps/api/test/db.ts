import { PrismaClient } from "@prisma/client";
import { inject } from "vitest";

/**
 * Cliente Prisma apuntado al PostgreSQL efímero de los tests. La URL la publica
 * `test/global-setup.ts`; no se lee de `.env` para que un test nunca pueda tocar por accidente
 * la base de desarrollo.
 */
export function crearClienteDePrueba(): PrismaClient {
  return new PrismaClient({ datasourceUrl: inject("databaseUrl") });
}

/**
 * Prefijo único por archivo de test. Los tests **no** asumen tablas vacías: comparten un
 * contenedor por corrida, y `audit_log` no se puede limpiar (es append-only, T-004). Etiquetar
 * los datos propios y filtrar por la etiqueta es lo que los hace independientes entre sí.
 */
export function etiqueta(nombre: string): string {
  return `test-${nombre}-${process.hrtime.bigint().toString(36)}`;
}
