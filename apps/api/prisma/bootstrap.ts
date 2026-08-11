import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { validateSlug } from "@polo/domain";
import { crearClubCompleto } from "../src/club/create-club.js";

/**
 * El primer club de una instalación (HU-020-03, decisión D-020-04).
 *
 * **Existe para salir del problema del huevo y la gallina**: dar de alta clubes es una ruta que
 * exige `platform.club.manage`, y en una instalación nueva no hay ningún superadministrador con
 * quien autenticarse para pedirla.
 *
 * **No hay ni habrá una ruta HTTP que haga esto.** Se decidió así (D-020-04) porque cualquier
 * atajo para el caso inicial —una clave de arranque, una ruta abierta «sólo la primera vez»— es
 * exactamente el tipo de puerta que después nadie recuerda cerrar. Correrlo exige acceso al
 * servidor, que es la única credencial que no se puede robar por internet.
 *
 * Uso:
 *   pnpm bootstrap:club --slug=lospinos --name="Club Los Pinos" \
 *     --admin=maria@lospinos.co --admin-nombre="María" --superadmin=daniel@ejemplo.com
 */

interface Argumentos {
  slug: string;
  name: string;
  admin: string;
  adminNombre: string;
  superadmin: string;
  timezone: string;
  currency: string;
}

export function leerArgumentos(argv: readonly string[]): Argumentos | { error: string } {
  const valores = new Map<string, string>();

  for (const arg of argv) {
    const coincidencia = /^--([a-z-]+)=(.*)$/.exec(arg);

    if (coincidencia !== null && coincidencia[1] !== undefined && coincidencia[2] !== undefined) {
      valores.set(coincidencia[1], coincidencia[2]);
    }
  }

  const obligatorios = ["slug", "name", "admin", "admin-nombre", "superadmin"];
  const faltantes = obligatorios.filter((clave) => (valores.get(clave) ?? "").length === 0);

  if (faltantes.length > 0) {
    return { error: `Faltan argumentos: ${faltantes.map((f) => `--${f}`).join(", ")}` };
  }

  return {
    slug: valores.get("slug") ?? "",
    name: valores.get("name") ?? "",
    admin: valores.get("admin") ?? "",
    adminNombre: valores.get("admin-nombre") ?? "",
    superadmin: valores.get("superadmin") ?? "",
    timezone: valores.get("timezone") ?? "America/Bogota",
    currency: valores.get("currency") ?? "COP",
  };
}

/** Contraseña inicial: se imprime **una vez**, en la terminal de quien corre el script. */
function contrasenaInicial(): string {
  return randomBytes(12).toString("base64url");
}

export async function arrancarPrimerClub(
  prisma: PrismaClient,
  argumentos: Argumentos,
  log: (mensaje: string) => void,
): Promise<"creado" | "ya-estaba"> {
  // Idempotente por la vía más simple y más difícil de discutir: si ya hay un club, esta
  // instalación ya fue arrancada. No se «completa» nada a medias.
  const clubesExistentes = await prisma.club.count();

  if (clubesExistentes > 0) {
    log(`Esta instalación ya tiene ${clubesExistentes} club(es). No hay nada que arrancar.`);

    return "ya-estaba";
  }

  const slug = validateSlug(argumentos.slug);

  if (!slug.ok) {
    throw new Error(`El subdominio «${argumentos.slug}» no sirve: ${slug.error}`);
  }

  const contrasenaAdmin = contrasenaInicial();
  const contrasenaSuperadmin = contrasenaInicial();

  await prisma.$transaction(async (tx) => {
    const club = await crearClubCompleto(tx, {
      slug: slug.value,
      name: argumentos.name,
      timezone: argumentos.timezone,
      currency: argumentos.currency,
      adminEmail: argumentos.admin,
      adminFullName: argumentos.adminNombre,
      adminPasswordHash: await argon2.hash(contrasenaAdmin, { type: argon2.argon2id }),
      // `active` y no `invited`: el correo de invitación todavía no existe (T-050 de specs/010) y
      // una cuenta invitada sin forma de recibir la invitación no puede entrar a ningún lado. La
      // contraseña se entrega por el canal por el que se corre esto, que es una persona.
      adminStatus: "active",
    });

    // El superadministrador es **nuestro**, no del club, pero su `person` tiene que colgar de
    // algún club por el esquema. Cuelga del primero, y su rol es de plataforma: no manda en ese
    // club por ser de ahí, manda en todos por ser superadministrador.
    const persona = await tx.person.create({
      data: { clubId: club.id, fullName: "Superadministrador de la plataforma", email: argumentos.superadmin },
    });
    const cuenta = await tx.userAccount.create({
      data: {
        personId: persona.id,
        email: argumentos.superadmin,
        passwordHash: await argon2.hash(contrasenaSuperadmin, { type: argon2.argon2id }),
        status: "active",
      },
    });
    await tx.roleAssignment.create({
      data: {
        userAccountId: cuenta.id,
        role: "superadmin",
        scope: "platform",
        scopeId: null,
        grantedById: cuenta.id,
      },
    });

    log(`Club «${club.name}» creado en el subdominio ${club.slug}.`);
  });

  log("");
  log("Contraseñas iniciales — se muestran UNA sola vez, cámbialas al entrar:");
  log(`  ${argumentos.admin} (administrador del club): ${contrasenaAdmin}`);
  log(`  ${argumentos.superadmin} (superadministrador): ${contrasenaSuperadmin}`);

  return "creado";
}

async function main(): Promise<void> {
  const argumentos = leerArgumentos(process.argv.slice(2));

  if ("error" in argumentos) {
    console.error(argumentos.error);
    console.error(
      'Uso: pnpm bootstrap:club --slug=lospinos --name="Club Los Pinos" ' +
        '--admin=maria@club.co --admin-nombre="María" --superadmin=daniel@ejemplo.com',
    );
    process.exitCode = 1;

    return;
  }

  const prisma = new PrismaClient();

  try {
    await arrancarPrimerClub(prisma, argumentos, (mensaje) => {
      console.log(mensaje);
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
