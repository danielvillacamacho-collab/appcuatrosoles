import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ClubHandicapListResponse,
  HandicapHistoryResponse,
  HandicapTypeName,
  HandicapValue,
  PersonHandicapsResponse,
  SetHandicapRequest,
} from "@polo/contracts";
import {
  HANDICAP_POR_DEFECTO,
  planearCambioDeHandicap,
  puedeVerElHistorial,
  validarHandicap,
  type HandicapHalves,
  type RechazoDeCambio,
} from "@polo/domain";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiException } from "../common/errors/api-error.js";
import { PrismaService } from "../common/prisma/prisma.service.js";

/** Quién pregunta. Los roles los resuelve este servicio: el controlador no toca la base. */
export interface ActorDeHandicap {
  userAccountId: string;
  personId: string;
}

@Injectable()
export class HandicapsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Los dos handicaps vigentes de una persona.
   *
   * Públicos dentro del club (R-030-09): hacen falta para entender cómo quedó armado un equipo.
   */
  async delPersona(clubId: string, personId: string): Promise<PersonHandicapsResponse> {
    await this.exigirDelClub(clubId, personId);

    const filas = await this.prisma.playerHandicap.findMany({
      where: { personId },
      select: { type: true, valueHalves: true, updatedAt: true },
    });

    return {
      personId,
      international: comoValor(filas.find((fila) => fila.type === "international")),
      club: comoValor(filas.find((fila) => fila.type === "club")),
    };
  }

  /**
   * Fija un handicap (T-330). **Es el único escritor de las dos tablas.**
   *
   * El orden de los pasos está en `plan.md` §5 y no es intercambiable:
   *
   * 1. La persona se carga **filtrada por club**. Si no está, 404 — nunca 403, que confirmaría que
   *    existe en otro club (P-05).
   * 2. Se toma un **candado de fila sobre la persona** y recién entonces se lee el vigente. Leer
   *    dentro de la transacción **no alcanza**: PostgreSQL corre en `READ COMMITTED`, así que dos
   *    transacciones simultáneas leen las dos el mismo valor y las dos anotan el mismo «anterior».
   *    Comprobado — la primera versión de este servicio decía en un comentario que la transacción
   *    bastaba, y el test de concurrencia pasaba igual con y sin ella, que es la señal de que no
   *    probaba nada (T-332).
   * 3. El dominio decide. El servicio no vuelve a comprobar nada por su cuenta.
   * 4. Vigente e historial se escriben **juntos**. No hay camino que actualice uno sin el otro, y
   *    eso es lo único que hace confiable al historial (R-030-11).
   */
  async fijar(
    clubId: string,
    personId: string,
    tipo: HandicapTypeName,
    datos: SetHandicapRequest,
    actor: ActorDeHandicap,
  ): Promise<PersonHandicapsResponse> {
    await this.exigirDelClub(clubId, personId);

    const temporada = await this.temporadaVigente(clubId);

    await this.prisma.$transaction(async (tx) => {
      // **El candado.** Se toma sobre `person` y no sobre `player_handicap` porque la fila del
      // handicap puede no existir todavía —el primer cambio de una persona— y no se puede bloquear
      // lo que no está. La persona siempre está, y bloquearla serializa los cambios de sus dos
      // handicaps. El costo es que un cambio de handicap y una edición de la persona se esperan
      // entre sí; las dos cosas ocurren un puñado de veces al año.
      await tx.$queryRaw`SELECT id FROM "person" WHERE id = ${personId} FOR UPDATE`;

      const vigente = await tx.playerHandicap.findUnique({
        where: { personId_type: { personId, type: tipo } },
        select: { valueHalves: true },
      });

      const actual = vigente === null ? HANDICAP_POR_DEFECTO : exigirValido(vigente.valueHalves);
      const plan = planearCambioDeHandicap(actual, datos.valueHalves, datos.reason);

      if (!plan.ok) {
        throw traducirRechazo(plan.error);
      }

      await tx.playerHandicap.upsert({
        where: { personId_type: { personId, type: tipo } },
        create: { clubId, personId, type: tipo, valueHalves: plan.value.nuevo },
        update: { valueHalves: plan.value.nuevo },
      });

      await tx.handicapHistory.create({
        data: {
          clubId,
          personId,
          type: tipo,
          previousHalves: plan.value.anterior,
          newHalves: plan.value.nuevo,
          changedById: actor.userAccountId,
          reason: plan.value.motivo,
          ...(temporada === null ? {} : { seasonId: temporada }),
        },
      });
    });

    return this.delPersona(clubId, personId);
  }

  /**
   * El historial completo, con R-030-09 aplicada **aquí** y no en el controlador ni en la pantalla.
   *
   * **El rechazo es 404 y no 403**, con el mismo criterio que todo el repo: un 403 sobre el
   * historial de alguien confirma que esa persona existe en este club.
   */
  async historial(
    clubId: string,
    personId: string,
    actor: ActorDeHandicap,
  ): Promise<HandicapHistoryResponse> {
    await this.exigirDelClub(clubId, personId);

    const acudientes = await this.prisma.guardianship.findMany({
      where: { dependentPersonId: personId },
      select: { guardianPersonId: true },
    });

    const roles = await this.prisma.roleAssignment.findMany({
      where: { userAccountId: actor.userAccountId, revokedAt: null },
      select: { role: true },
    });

    const permitido = puedeVerElHistorial(
      {
        personId: actor.personId,
        // **Por rol y no por permiso**, a propósito: el permiso que vendría a la mano
        // —`handicap.edit`— **no lo tiene** el administrador del club, y usarlo aquí le cerraría la
        // lectura del historial, que sí le corresponde.
        esAdministrador: roles.some((asignacion) =>
          ["club_admin", "organization_admin", "superadmin"].includes(asignacion.role),
        ),
        esComisario: roles.some((asignacion) => asignacion.role === "commissioner"),
      },
      { personId, acudientes: acudientes.map((vinculo) => vinculo.guardianPersonId) },
    );

    if (!permitido) {
      throw new NotFoundException();
    }

    const registros = await this.prisma.handicapHistory.findMany({
      where: { personId, clubId },
      orderBy: { changedAt: "desc" },
      select: {
        id: true,
        type: true,
        previousHalves: true,
        newHalves: true,
        reason: true,
        changedAt: true,
        changedBy: { select: { person: { select: { id: true, fullName: true } } } },
        season: { select: { id: true, name: true } },
      },
    });

    return {
      personId,
      entries: registros.map((registro) => ({
        id: registro.id,
        type: registro.type,
        previousHalves: registro.previousHalves,
        newHalves: registro.newHalves,
        reason: registro.reason,
        changedAt: registro.changedAt.toISOString(),
        changedBy: {
          personId: registro.changedBy.person.id,
          fullName: registro.changedBy.person.fullName,
        },
        season: registro.season,
      })),
    };
  }

  /**
   * El handicap de todo el club, paginado (T-335).
   *
   * Parte de `person` y no de `player_handicap`: quien no ha sido calificado **también aparece**,
   * con su valor por defecto y `calificado: false`. Listar sólo a los calificados dejaría a quien
   * arma equipos creyendo que el resto no existe.
   */
  async delClub(
    clubId: string,
    tipo: HandicapTypeName,
    pagina: { page: number; limit: number },
  ): Promise<ClubHandicapListResponse> {
    const donde: Prisma.PersonWhereInput = { clubId, status: "active" };

    const [personas, total] = await Promise.all([
      this.prisma.person.findMany({
        where: donde,
        orderBy: { fullName: "asc" },
        skip: (pagina.page - 1) * pagina.limit,
        take: pagina.limit,
        select: {
          id: true,
          fullName: true,
          handicaps: {
            where: { type: tipo },
            select: { valueHalves: true, updatedAt: true },
          },
        },
      }),
      this.prisma.person.count({ where: donde }),
    ]);

    return {
      items: personas.map((persona) => ({
        personId: persona.id,
        fullName: persona.fullName,
        handicap: comoValor(persona.handicaps[0]),
      })),
      total,
      page: pagina.page,
      limit: pagina.limit,
    };
  }

  /** 404 y no 403: no se filtra que la persona exista en otro club (P-05, `docs/06`). */
  private async exigirDelClub(clubId: string, personId: string): Promise<void> {
    const persona = await this.prisma.person.findFirst({
      where: { id: personId, clubId },
      select: { id: true },
    });

    if (persona === null) {
      throw new NotFoundException();
    }
  }

  /**
   * La temporada abierta hoy, si hay alguna.
   *
   * Devolver `null` es un resultado normal, no un error: que el club no tenga temporada abierta no
   * puede bloquear una decisión deportiva (R-030-12).
   */
  private async temporadaVigente(clubId: string): Promise<string | null> {
    const abierta = await this.prisma.season.findFirst({
      where: { clubId, status: "open" },
      orderBy: { startsOn: "desc" },
      select: { id: true },
    });

    return abierta?.id ?? null;
  }
}

/** Una fila del vigente, o su ausencia, como valor del contrato. */
function comoValor(
  fila: { valueHalves: number; updatedAt: Date } | undefined,
): HandicapValue {
  if (fila === undefined) {
    // **La ausencia de fila es un dato** (`plan.md` §2): nadie ha calificado a esta persona.
    return { valueHalves: HANDICAP_POR_DEFECTO, calificado: false, updatedAt: null };
  }

  return {
    valueHalves: fila.valueHalves,
    calificado: true,
    updatedAt: fila.updatedAt.toISOString(),
  };
}

/**
 * Un valor que ya está en la base tiene que ser válido.
 *
 * Si no lo fuera, algo lo escribió sin pasar por el dominio y **hay que enterarse**: seguir con un
 * valor corrupto ahí lo propagaría al historial como «anterior», que es donde más duele.
 */
function exigirValido(valueHalves: number): HandicapHalves {
  const validado = validarHandicap(valueHalves);

  if (!validado.ok) {
    throw new Error(
      `Handicap corrupto en la base: ${valueHalves} (${validado.error}). Algo escribió sin pasar por el dominio.`,
    );
  }

  return validado.value;
}

/** Cada rechazo del dominio con su código propio, para que la interfaz explique cuál falló. */
function traducirRechazo(rechazo: RechazoDeCambio): ApiException {
  switch (rechazo.razon) {
    case "fuera_de_rango":
      return new ApiException(
        "handicap_fuera_de_rango",
        422,
        "El handicap va de −2 a 10 goles.",
      );
    case "no_es_medio_gol":
      return new ApiException(
        "handicap_no_es_medio_gol",
        422,
        "El handicap se mueve en medios goles.",
      );
    case "sin_cambio":
      return new ApiException(
        "handicap_sin_cambio",
        409,
        "Ese jugador ya tiene ese handicap.",
        { actualHalves: rechazo.actual },
      );
    case "sin_motivo":
      return new ApiException("handicap_sin_motivo", 422, "Escribe el motivo del cambio.");
  }
}

/** El tipo del cliente de Prisma dentro de una transacción, para que `tx` no sea `any`. */
export type TransaccionPrisma = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
