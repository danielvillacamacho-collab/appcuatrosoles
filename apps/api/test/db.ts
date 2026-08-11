import { PrismaClient } from "@prisma/client";
import { inject } from "vitest";
import type { Test } from "supertest";
import { CABECERA_CSRF, tokenCsrfParaSesion } from "../src/common/auth/csrf.js";
import { COOKIE_DE_SESION } from "../src/common/auth/session-token.js";

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

/**
 * Autentica una petición de prueba: cookie de sesión **y** token de CSRF.
 *
 * Las dos cosas juntas, porque desde T-025 una mutación con sesión y sin token de CSRF se rechaza
 * con `403` — que es lo que hace un navegador de verdad. Un ayudante que pusiera sólo la cookie
 * haría que cada test tuviera que acordarse de la otra mitad, y los que se olvidaran fallarían por
 * una razón que no tiene nada que ver con lo que están probando.
 */
export function conSesion(peticion: Test, token: string): Test {
  return peticion
    .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
    .set(CABECERA_CSRF, tokenCsrfParaSesion(token));
}
