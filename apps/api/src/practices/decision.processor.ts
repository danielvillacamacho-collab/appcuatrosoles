import { Inject, Injectable } from "@nestjs/common";
import {
  armarPuestos,
  decidirPractica,
  repartirCupos,
  type Clock,
  type Postulacion,
  type Puesto,
} from "@polo/domain";
import type { Prisma } from "@prisma/client";
import { CLOCK } from "../common/clock/clock.module.js";
import { logger } from "../common/logging/logger.js";
import { OutboxRepository } from "../common/outbox/outbox.repository.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { BookingsService } from "../fields/bookings.service.js";

/**
 * Decide las prácticas que ya vencieron (`specs/050` HU-050-04).
 *
 * **No hay nada programado.** Podría encolarse un trabajo para las 6:00 p.m. de cada práctica y no
 * se hace, por una razón: un trabajo programado que no se disparó —porque el servidor estaba caído,
 * porque se perdió en un despliegue, porque alguien cambió la hora— **no deja rastro**, y la
 * práctica se queda esperando para siempre sin que nadie se entere.
 *
 * «Dame las publicadas cuya hora de decisión ya pasó» es una consulta que **siempre da la respuesta
 * correcta**, se corra cuando se corra. Si el sistema estuvo caído dos horas, al volver decide lo
 * que quedó pendiente. Es la misma forma del `OutboxProcessor`, y por las mismas razones.
 */
@Injectable()
export class DecisionProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly outbox: OutboxRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Decide lo vencido. Devuelve cuántas prácticas decidió — lo que el arnés de pruebas necesita
   * para no adivinar.
   */
  async decidirVencidas(limite = 20): Promise<number> {
    const vencidas = await this.prisma.practice.findMany({
      where: { status: "published", decisionAt: { lte: this.clock.now() } },
      orderBy: { decisionAt: "asc" },
      take: limite,
      select: { id: true, clubId: true },
    });

    let decididas = 0;

    for (const practica of vencidas) {
      try {
        if (await this.decidirUna(practica.id, practica.clubId)) {
          decididas += 1;
        }
      } catch (error) {
        // Una práctica que falla no puede impedir que se decidan las demás: son independientes, y
        // dejar el resto sin decidir por culpa de una es peor que el fallo original.
        logger.error(
          { err: error, practiceId: practica.id },
          "No se pudo decidir una práctica; se sigue con las demás.",
        );
      }
    }

    return decididas;
  }

  /**
   * Una práctica, en **su propia transacción**.
   *
   * El candado va primero, con la lección de `specs/030` T-332: PostgreSQL corre en
   * `READ COMMITTED`, así que sin `FOR UPDATE` este proceso y alguien retirándose en el mismo
   * segundo leen los dos el mismo estado, y la práctica se decide con una foto que ya no es cierta.
   */
  private async decidirUna(practiceId: string, clubId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "practice" WHERE id = ${practiceId} FOR UPDATE`;

      const practica = await tx.practice.findUnique({
        where: { id: practiceId },
        include: {
          applications: {
            where: { withdrawnAt: null },
            select: {
              id: true,
              personId: true,
              appliedAt: true,
              chukkersOffered: true,
              halfManPartnerPersonId: true,
              person: {
                select: { fullName: true, userAccount: { select: { email: true } } },
              },
            },
          },
        },
      });

      if (practica === null) {
        return false;
      }

      const postulaciones: Postulacion[] = practica.applications.map((una) => ({
        id: una.id,
        personId: una.personId,
        appliedAt: una.appliedAt,
        chukkersOffered: una.chukkersOffered,
        halfManPartnerPersonId: una.halfManPartnerPersonId,
      }));

      const reparto = repartirCupos(armarPuestos(postulaciones), practica.targetPlayers);
      const decision = decidirPractica(
        {
          estado: practica.status,
          minimo: practica.minPlayers,
          decisionAt: practica.decisionAt,
        },
        reparto.dentro.length,
        this.clock.now(),
      );

      if (decision === "todavia_no" || decision === "ya_decidida") {
        return false;
      }

      // **El reparto se materializa aquí y sólo aquí** (`plan.md` §0.1): hasta este momento era una
      // vista sobre el orden de llegada; a partir de ahora es un hecho —«ésta es la gente que
      // jugó»— y tiene que quedar estable aunque después cambie cualquier cosa.
      await this.materializar(tx, reparto, decision);

      if (decision === "cancelar" && practica.fieldBookingId !== null) {
        // Cancelar libera la cancha (R-050-12), en esta misma transacción.
        await this.bookings.cancelarEn(tx, clubId, practica.fieldBookingId);
      }

      await tx.practice.update({
        where: { id: practiceId },
        data: {
          status: decision === "confirmar" ? "confirmed" : "cancelled",
          decidedAt: this.clock.now(),
          ...(decision === "cancelar"
            ? { cancellationReason: "No se alcanzó el mínimo de jugadores." }
            : {}),
        },
      });

      // Los avisos van en **la misma transacción** (P-11). Si el cambio se revierte, los correos se
      // van con él; si el proceso muere después del `COMMIT`, ya están encolados y salen solos.
      await this.avisar(tx, practica, reparto, decision);

      return true;
    });
  }

  /** Quién quedó dentro y quién no, escrito de una vez. */
  private async materializar(
    tx: Prisma.TransactionClient,
    reparto: { dentro: readonly Puesto[]; enEspera: readonly Puesto[] },
    decision: "confirmar" | "cancelar",
  ): Promise<void> {
    const idsDentro = reparto.dentro.flatMap(idsDe);
    const idsFuera = reparto.enEspera.flatMap(idsDe);

    if (decision === "cancelar") {
      // En una práctica cancelada **nadie fue aceptado**: marcar «dentro» a quien nunca jugó
      // ensuciaría la estadística que 051 va a leer de aquí.
      await tx.practiceApplication.updateMany({
        where: { id: { in: [...idsDentro, ...idsFuera] } },
        data: { outcome: "rejected" },
      });

      return;
    }

    await tx.practiceApplication.updateMany({
      where: { id: { in: idsDentro } },
      data: { outcome: "accepted" },
    });

    if (idsFuera.length > 0) {
      await tx.practiceApplication.updateMany({
        where: { id: { in: idsFuera } },
        data: { outcome: "rejected" },
      });
    }
  }

  /**
   * Un aviso por persona.
   *
   * Se avisa **a todos los postulados**, no sólo a los que quedaron dentro: quien estaba en la
   * lista de espera también necesita saber que no juega, y quien se quedó afuera de una práctica
   * cancelada tiene el mismo derecho a no preparar caballos en vano.
   */
  private async avisar(
    tx: Prisma.TransactionClient,
    practica: {
      id: string;
      clubId: string;
      startsAt: Date;
      applications: readonly {
        personId: string;
        person: { fullName: string; userAccount: { email: string } | null };
      }[];
    },
    reparto: { dentro: readonly Puesto[]; enEspera: readonly Puesto[] },
    decision: "confirmar" | "cancelar",
  ): Promise<void> {
    const dentro = new Set(reparto.dentro.flatMap((puesto) => personasDe(puesto)));

    for (const postulacion of practica.applications) {
      const correo = postulacion.person.userAccount?.email;

      if (correo === undefined) {
        // Un menor sin cuenta propia no recibe correo. Avisarle a su acudiente es de `specs/120`,
        // que es donde vive el enrutamiento de avisos por familia.
        continue;
      }

      await this.outbox.encolar(tx, {
        tipo: decision === "confirmar" ? "practice.confirmed" : "practice.cancelled",
        clubId: practica.clubId,
        payload: {
          email: correo,
          fullName: postulacion.person.fullName,
          practiceId: practica.id,
          startsAt: practica.startsAt.toISOString(),
          dentro: dentro.has(postulacion.personId),
        },
      });
    }
  }
}

function idsDe(puesto: Puesto): string[] {
  return puesto.companero === null
    ? [puesto.titular.id]
    : [puesto.titular.id, puesto.companero.id];
}

function personasDe(puesto: Puesto): string[] {
  return puesto.companero === null
    ? [puesto.titular.personId]
    : [puesto.titular.personId, puesto.companero.personId];
}
