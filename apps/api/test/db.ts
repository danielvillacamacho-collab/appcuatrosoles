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

/**
 * Crea un club de prueba y devuelve su identificador.
 *
 * Desde T-202, `person`, `membership_category`, `waiver_version` y las demás tablas del módulo
 * 010 tienen llave foránea hacia `club`: un test ya no puede inventarse un `clubId`. Eso es
 * exactamente lo que la restricción existe para impedir —una fila de un club que no existe— y la
 * consecuencia de tenerla es que los tests se parecen un poco más a la realidad.
 *
 * El slug se deriva de la etiqueta del test para que sea único y cumpla el formato de T-201.
 */
export async function crearClubDePrueba(prisma: PrismaClient, nombre = "club"): Promise<string> {
  const marca = etiqueta(nombre).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const club = await prisma.club.create({ data: { slug: marca, name: `Club ${marca}` } });

  return club.id;
}
