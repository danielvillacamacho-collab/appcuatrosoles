import { Injectable } from "@nestjs/common";
import type { CalendarEntry, CalendarResponse } from "@polo/contracts";
import { puedeVerElDetalle, rangoDelDia } from "@polo/domain";
import { PrismaService } from "../common/prisma/prisma.service.js";

/** Lo que se sabe de quien pregunta. `participa` lo resuelve este servicio; ver la nota de abajo. */
export interface QuienConsulta {
  userAccountId: string | null;
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El día de una cancha por cancha, **ya filtrado por privacidad** (T-450, T-451).
   *
   * El orden de los pasos importa y está escrito en `plan.md` §5:
   *
   * 1. La fecha llega como día de calendario, no como instante.
   * 2. Se traduce a un rango UTC **con la zona del club**. Un martes en Bogotá empieza a las 05:00
   *    UTC; resolverlo con la zona del servidor devolvería otro día.
   * 3. Se consultan las reservas vigentes que se solapan con ese rango.
   * 4. **Recién ahí** se decide, una por una, si quien pregunta puede ver el detalle.
   *
   * El paso 4 va aquí y no en el controlador ni en el cliente: es la regla, y tiene que estar donde
   * no se pueda saltar. Mandar el calendario completo y esconderlo en el navegador es publicarlo —
   * los datos están en la respuesta, y el navegador es de quien mira.
   */
  async delDia(clubId: string, dia: string, quien: QuienConsulta): Promise<CalendarResponse> {
    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
      select: { timezone: true },
    });

    const rango = rangoDelDia(dia, club.timezone);

    const canchas = await this.prisma.field.findMany({
      where: { clubId, status: { not: "archived" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    const reservas = await this.prisma.fieldBooking.findMany({
      where: {
        clubId,
        cancelledAt: null,
        // El mismo solapamiento de R-040-04: empieza antes de que el día termine y termina después
        // de que empieza. Una práctica que cruza la medianoche aparece en los dos días, que es lo
        // correcto — está ocupando la cancha en los dos.
        startsAt: { lt: rango.fin },
        endsAt: { gt: rango.inicio },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        fieldId: true,
        startsAt: true,
        endsAt: true,
        type: true,
        reason: true,
        sourceId: true,
        visibility: true,
        createdById: true,
      },
    });

    return {
      date: dia,
      timezone: club.timezone,
      fields: canchas.map((cancha) => ({
        id: cancha.id,
        name: cancha.name,
        entries: reservas
          .filter((reserva) => reserva.fieldId === cancha.id)
          .map((reserva) => this.comoEntrada(reserva, quien)),
      })),
    };
  }

  /**
   * Una reserva, en la forma que le corresponde a quien pregunta.
   *
   * **`participa` es `false` hoy, y es correcto que lo sea**: la participación se conoce cuando
   * exista `practice_application` (`specs/050`) — hoy no hay a qué inscribirse. Que entre explícito
   * en vez de omitirse es lo que hace que, cuando llegue, se vea de inmediato dónde conectarlo: la
   * regla ya está escrita y probada con sus seis casos (T-412).
   */
  private comoEntrada(
    reserva: {
      id: string;
      startsAt: Date;
      endsAt: Date;
      type: string;
      reason: string | null;
      sourceId: string | null;
      visibility: "public" | "private";
      createdById: string;
    },
    quien: QuienConsulta,
  ): CalendarEntry {
    const conDetalle = puedeVerElDetalle(
      { visibility: reserva.visibility, createdById: reserva.createdById },
      { userAccountId: quien.userAccountId, participa: false },
    );

    if (!conDetalle) {
      // **Sólo el horario.** Ni el identificador, ni el tipo, ni de quién es: nada que permita
      // deducir quién toma clases o taquea a cierta hora.
      return {
        detalle: false,
        startsAt: reserva.startsAt.toISOString(),
        endsAt: reserva.endsAt.toISOString(),
      };
    }

    return {
      detalle: true,
      id: reserva.id,
      startsAt: reserva.startsAt.toISOString(),
      endsAt: reserva.endsAt.toISOString(),
      type: reserva.type,
      reason: reserva.reason,
      sourceId: reserva.sourceId,
    };
  }
}
