import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AdjustTeamsRequest, PracticeTeamsResponse } from "@polo/contracts";
import {
  armarPuestos,
  balancearEquipos,
  handicapDelPuesto,
  validarHandicap,
  type Clock,
  type HandicapHalves,
  type Postulacion,
  type Puesto,
} from "@polo/domain";
import type { Prisma } from "@prisma/client";
import { CLOCK } from "../common/clock/clock.module.js";
import { ApiException } from "../common/errors/api-error.js";
import { OutboxRepository } from "../common/outbox/outbox.repository.js";
import { PrismaService } from "../common/prisma/prisma.service.js";

/** Lo que hace falta de una práctica para armar sus equipos. */
const PARA_ARMAR = {
  include: {
    applications: {
      where: { withdrawnAt: null },
      select: {
        id: true,
        personId: true,
        appliedAt: true,
        chukkersOffered: true,
        halfManPartnerPersonId: true,
        person: { select: { fullName: true } },
      },
    },
  },
} satisfies Prisma.PracticeDefaultArgs;

const CON_PUESTOS = {
  include: {
    slots: {
      orderBy: { position: "asc" },
      include: {
        primary: { select: { id: true, fullName: true } },
        secondary: { select: { id: true, fullName: true } },
      },
    },
  },
} satisfies Prisma.PracticeTeamDefaultArgs;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Arma los equipos desde cero (T-620).
   *
   * **Borra los anteriores y vuelve a crear.** Es lo que espera quien pide «rearmar»: descartar sus
   * propios ajustes y volver a la propuesta del sistema. Los puestos se van con los equipos por el
   * `Cascade`, así que no quedan huérfanos.
   *
   * Recibe el cliente de transacción porque el proceso de decisión propone **dentro de la misma
   * transacción** en que confirma la práctica (`plan.md` §5): una práctica confirmada sin equipos
   * rompería la promesa de HU-051-01, y con dos transacciones separadas eso pasa en cuanto el
   * proceso muere entre una y otra.
   */
  async proponerEn(tx: Prisma.TransactionClient, clubId: string, practiceId: string): Promise<void> {
    const practica = await tx.practice.findFirst({
      where: { id: practiceId, clubId },
      ...PARA_ARMAR,
    });

    if (practica === null) {
      throw new NotFoundException();
    }

    if (practica.status !== "confirmed") {
      throw new ApiException(
        "practica_no_confirmada",
        HttpStatus.CONFLICT,
        "Sólo se arman equipos de una práctica confirmada.",
      );
    }

    const puestos = await this.puestosConHandicap(tx, practica);

    await tx.practiceTeam.deleteMany({ where: { practiceId } });

    const reparto = balancearEquipos(
      puestos.map((puesto) => ({ id: puesto.id, handicapHalves: puesto.handicapHalves })),
    );

    for (const [label, ids] of [
      ["A", reparto.equipoA],
      ["B", reparto.equipoB],
    ] as const) {
      const suyos = puestos.filter((puesto) => ids.includes(puesto.id));

      await tx.practiceTeam.create({
        data: {
          clubId,
          practiceId,
          label,
          handicapTotalHalves: suyos.reduce((suma, puesto) => suma + puesto.handicapHalves, 0),
          slots: {
            create: suyos.map((puesto, indice) => ({
              clubId,
              position: indice + 1,
              primaryPersonId: puesto.titularId,
              secondaryPersonId: puesto.companeroId,
              effectiveHandicapHalves: puesto.handicapHalves,
            })),
          },
        },
      });
    }
  }

  /** Lo mismo, abriendo su propia transacción: es como lo llama el controlador. */
  async proponer(clubId: string, practiceId: string): Promise<PracticeTeamsResponse> {
    await this.prisma.$transaction((tx) => this.proponerEn(tx, clubId, practiceId));

    return this.ver(clubId, practiceId, { puedeAprobar: true });
  }

  /**
   * Ajustar: se recibe la composición entera y se reasignan los puestos (T-622).
   *
   * **No se recalcula el handicap de nadie.** Mover a alguien de equipo no cambia cuánto pesa; el
   * peso quedó congelado al proponer. Recalcularlo acá haría que un cambio de handicap ocurrido en
   * el medio se colara sin que nadie lo pidiera.
   */
  async ajustar(
    clubId: string,
    practiceId: string,
    cambios: AdjustTeamsRequest,
  ): Promise<PracticeTeamsResponse> {
    const equipos = await this.exigirEquipos(clubId, practiceId);
    const puestos = equipos.flatMap((equipo) => equipo.slots);
    const pedidos = cambios.equipos.flatMap((equipo) => equipo.slotIds);

    // Todos los puestos y sólo los puestos: sin esto, un ajuste podría dejar gente afuera de los
    // dos equipos y nadie se enteraría hasta la cancha.
    const faltanOSobran =
      pedidos.length !== puestos.length ||
      new Set(pedidos).size !== pedidos.length ||
      !pedidos.every((id) => puestos.some((puesto) => puesto.id === id));

    if (faltanOSobran) {
      throw new ApiException(
        "equipos_incompletos",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Los equipos tienen que incluir exactamente a los que juegan, cada uno una vez.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // **En dos pasadas, y no en una.**
      //
      // El índice único es `(equipo, posición)`, y reasignar de a una fila pasa por estados
      // intermedios que lo violan: si el primer puesto de A se va al otro equipo, el segundo tiene
      // que pasar a la posición 1 **mientras el primero todavía está ahí**. La transacción entera
      // fallaba con un 500 y el ajuste no se guardaba.
      //
      // La primera pasada manda todo a posiciones negativas —distintas entre sí, y que ningún
      // puesto real usa— junto con su equipo definitivo. Ahí ya no hay colisión posible, y la
      // segunda pasada escribe las posiciones de verdad sobre un equipo donde todas son negativas.
      let temporal = 0;

      for (const equipo of cambios.equipos) {
        const destino = equipos.find((candidato) => candidato.label === equipo.label);

        if (destino === undefined) {
          continue;
        }

        for (const slotId of equipo.slotIds) {
          temporal -= 1;
          await tx.practiceSlot.update({
            where: { id: slotId },
            data: { practiceTeamId: destino.id, position: temporal },
          });
        }
      }

      for (const equipo of cambios.equipos) {
        const destino = equipos.find((candidato) => candidato.label === equipo.label);

        if (destino === undefined) {
          continue;
        }

        for (const [indice, slotId] of equipo.slotIds.entries()) {
          await tx.practiceSlot.update({
            where: { id: slotId },
            // La posición se recalcula porque el orden dentro del equipo cambia al mover gente.
            data: { position: indice + 1 },
          });
        }

        const suma = equipo.slotIds.reduce((total, slotId) => {
          const puesto = puestos.find((candidato) => candidato.id === slotId);

          return total + (puesto?.effectiveHandicapHalves ?? 0);
        }, 0);

        await tx.practiceTeam.update({
          where: { id: destino.id },
          data: { handicapTotalHalves: suma },
        });
      }
    });

    return this.ver(clubId, practiceId, { puedeAprobar: true });
  }

  /**
   * Aprobar: publica y avisa (T-622, R-051-07).
   *
   * **Se puede aprobar de nuevo**, y vuelve a avisar. Una práctica se reacomoda hasta último
   * momento y la plataforma no puede ser más rígida que la cancha; quien se enteró de un equipo
   * tiene derecho a enterarse de que cambió.
   */
  async aprobar(
    clubId: string,
    practiceId: string,
    aprobadoPor: string,
  ): Promise<PracticeTeamsResponse> {
    const equipos = await this.exigirEquipos(clubId, practiceId);
    const ahora = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      await tx.practiceTeam.updateMany({
        where: { practiceId },
        data: { approvedAt: ahora, approvedById: aprobadoPor },
      });

      const practica = await tx.practice.findUniqueOrThrow({
        where: { id: practiceId },
        select: { startsAt: true },
      });

      for (const equipo of equipos) {
        for (const puesto of equipo.slots) {
          for (const quien of [puesto.primary, puesto.secondary]) {
            if (quien === null) {
              continue;
            }

            const cuenta = await tx.userAccount.findUnique({
              where: { personId: quien.id },
              select: { email: true },
            });

            if (cuenta === null) {
              // Un menor sin cuenta propia no recibe correo. Enrutarlo a su acudiente es
              // `specs/120`, igual que en `specs/050`.
              continue;
            }

            await this.outbox.encolar(tx, {
              tipo: "practice.teams-published",
              clubId,
              payload: {
                email: cuenta.email,
                fullName: quien.fullName,
                practiceId,
                startsAt: practica.startsAt.toISOString(),
                equipo: equipo.label,
              },
            });
          }
        }
      }
    });

    return this.ver(clubId, practiceId, { puedeAprobar: true });
  }

  /**
   * Los equipos, si quien pregunta puede verlos (T-623, R-051-05).
   *
   * **404 y no 403** cuando hay una propuesta sin aprobar y quien mira no puede aprobarla: decir
   * «hay equipos pero no podés verlos» ya cuenta que existen, y lo que se quiere es que un borrador
   * no exista para nadie más.
   */
  async ver(
    clubId: string,
    practiceId: string,
    quien: { puedeAprobar: boolean },
  ): Promise<PracticeTeamsResponse> {
    const equipos = await this.prisma.practiceTeam.findMany({
      where: { practiceId, clubId },
      orderBy: { label: "asc" },
      ...CON_PUESTOS,
    });

    if (equipos.length === 0) {
      throw new NotFoundException();
    }

    const aprobados = equipos.every((equipo) => equipo.approvedAt !== null);

    if (!aprobados && !quien.puedeAprobar) {
      throw new NotFoundException();
    }

    const [a, b] = equipos;

    return {
      aprobados,
      aprobadosAt: a?.approvedAt?.toISOString() ?? null,
      diferenciaHalves: Math.abs(
        (a?.handicapTotalHalves ?? 0) - (b?.handicapTotalHalves ?? 0),
      ),
      equipos: equipos.map((equipo) => ({
        label: equipo.label,
        handicapTotalHalves: equipo.handicapTotalHalves,
        slots: equipo.slots.map((puesto) => ({
          id: puesto.id,
          position: puesto.position,
          effectiveHandicapHalves: puesto.effectiveHandicapHalves,
          titular: { personId: puesto.primary.id, fullName: puesto.primary.fullName },
          companero:
            puesto.secondary === null
              ? null
              : { personId: puesto.secondary.id, fullName: puesto.secondary.fullName },
        })),
      })),
    };
  }

  private async exigirEquipos(
    clubId: string,
    practiceId: string,
  ): Promise<Prisma.PracticeTeamGetPayload<typeof CON_PUESTOS>[]> {
    const equipos = await this.prisma.practiceTeam.findMany({
      where: { practiceId, clubId },
      orderBy: { label: "asc" },
      ...CON_PUESTOS,
    });

    if (equipos.length === 0) {
      throw new NotFoundException();
    }

    return equipos;
  }

  /**
   * Los puestos de la práctica, con **el handicap que corresponde a cada uno**.
   *
   * El handicap se lee acá, en el momento de proponer, y se guarda con el puesto (R-051-09). El tipo
   * —internacional o del club— lo eligió la práctica.
   */
  private async puestosConHandicap(
    tx: Prisma.TransactionClient,
    practica: Prisma.PracticeGetPayload<typeof PARA_ARMAR>,
  ): Promise<
    { id: string; titularId: string; companeroId: string | null; handicapHalves: HandicapHalves }[]
  > {
    const postulaciones: Postulacion[] = practica.applications.map((una) => ({
      id: una.id,
      personId: una.personId,
      appliedAt: una.appliedAt,
      chukkersOffered: una.chukkersOffered,
      halfManPartnerPersonId: una.halfManPartnerPersonId,
    }));

    const vigentes = await tx.playerHandicap.findMany({
      where: {
        personId: { in: postulaciones.map((una) => una.personId) },
        type: practica.handicapType,
      },
      select: { personId: true, valueHalves: true },
    });

    const porPersona = new Map(vigentes.map((fila) => [fila.personId, fila.valueHalves]));

    return armarPuestos(postulaciones).map((puesto: Puesto) => ({
      id: puesto.titular.id,
      titularId: puesto.titular.personId,
      companeroId: puesto.companero?.personId ?? null,
      handicapHalves: handicapDelPuesto(
        this.handicapDe(porPersona, puesto.titular.personId),
        puesto.companero === null ? null : this.handicapDe(porPersona, puesto.companero.personId),
      ),
    }));
  }

  /**
   * El handicap de una persona, o el valor por defecto si nadie la calificó.
   *
   * Es la misma regla de `specs/030` R-030-05: la ausencia de fila significa «sin calificar», y se
   * lee como −2 goles. Un puesto sin handicap no puede quedar fuera del reparto — jugaría igual.
   */
  private handicapDe(porPersona: ReadonlyMap<string, number>, personId: string): HandicapHalves {
    const valor = porPersona.get(personId);

    if (valor === undefined) {
      return POR_DEFECTO;
    }

    const validado = validarHandicap(valor);

    if (!validado.ok) {
      throw new Error(`Handicap corrupto en la base: ${valor} (${validado.error}).`);
    }

    return validado.value;
  }
}

const POR_DEFECTO = ((): HandicapHalves => {
  const validado = validarHandicap(-4);

  if (!validado.ok) {
    throw new Error("El handicap por defecto tiene que ser válido.");
  }

  return validado.value;
})();
