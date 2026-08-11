import type { Prisma } from "@prisma/client";
import { CATEGORIAS_POR_DEFECTO } from "./default-membership-categories.js";

export interface DatosDeClubNuevo {
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  adminEmail: string;
  adminFullName: string;
  /** Hash de la contraseña inicial del administrador. Ver la nota de abajo. */
  adminPasswordHash: string;
  /** Estado inicial de la cuenta del administrador. */
  adminStatus: "invited" | "active";
}

/**
 * Crea un club completo: sus categorías, su temporada abierta y su primer administrador.
 *
 * **Recibe la transacción, no la abre**, y esa es la razón de que exista: la usan el alta por API
 * (T-230) y el arranque por línea de comandos (T-232), y si cada uno escribiera su propia versión,
 * un club creado desde el servidor terminaría distinto de uno creado desde la plataforma. Ese tipo
 * de diferencia no se nota hasta que algo falla sólo en uno de los dos caminos.
 */
export async function crearClubCompleto(
  tx: Prisma.TransactionClient,
  datos: DatosDeClubNuevo,
): Promise<{ id: string; slug: string; name: string; timezone: string; currency: string; status: "active" | "suspended" }> {
  const club = await tx.club.create({
    data: {
      slug: datos.slug,
      name: datos.name,
      timezone: datos.timezone,
      currency: datos.currency,
    },
  });

  await tx.membershipCategory.createMany({
    data: CATEGORIAS_POR_DEFECTO.map((categoria) => ({ clubId: club.id, ...categoria })),
  });

  // Una temporada abierta desde el día uno: sin ella, la primera práctica que alguien cree no
  // tendría a qué período pertenecer (HU-020-06, última viñeta).
  const año = club.createdAt.getUTCFullYear();
  await tx.season.create({
    data: {
      clubId: club.id,
      name: `Temporada ${año}`,
      startsOn: new Date(Date.UTC(año, 0, 1)),
      endsOn: new Date(Date.UTC(año, 11, 31)),
    },
  });

  const persona = await tx.person.create({
    data: { clubId: club.id, fullName: datos.adminFullName, email: datos.adminEmail },
  });
  const cuenta = await tx.userAccount.create({
    data: {
      personId: persona.id,
      email: datos.adminEmail,
      passwordHash: datos.adminPasswordHash,
      status: datos.adminStatus,
    },
  });
  await tx.roleAssignment.create({
    data: {
      userAccountId: cuenta.id,
      role: "club_admin",
      scope: "club",
      scopeId: club.id,
      // Se otorga a sí mismo, igual que el primer administrador del seed: por definición no hay
      // nadie antes que él en ese club.
      grantedById: cuenta.id,
    },
  });

  return {
    id: club.id,
    slug: club.slug,
    name: club.name,
    timezone: club.timezone,
    currency: club.currency,
    status: club.status,
  };
}

/**
 * Lo que se guarda como contraseña de una cuenta que todavía no tiene una.
 *
 * No es una contraseña vacía: Argon2 nunca produce esta cadena, así que ninguna contraseña puede
 * coincidir con ella al verificar. La persona define la suya al aceptar la invitación.
 */
export const SIN_CONTRASENA = "sin-contrasena-hasta-aceptar-la-invitacion";
