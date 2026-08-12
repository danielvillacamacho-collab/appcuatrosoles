import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { BookingType, BookingVisibility, Prisma } from "@prisma/client";
import { cabeEnElHorario, esRangoValido, type Clock, type RechazoDeHorario } from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { ApiException } from "../common/errors/api-error.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { choqueDeReservas, esChoqueDeReservas } from "./overlap-error.js";

export interface DatosDeReserva {
  fieldId: string;
  startsAt: Date;
  endsAt: Date;
  type: BookingType;
  visibility?: BookingVisibility;
  /** El evento que la origina. Nulo en un bloqueo administrativo, que **es** el evento. */
  sourceId?: string | null;
  reason?: string | null;
}

const MENSAJES_DE_HORARIO: Record<RechazoDeHorario, string> = {
  antes_de_abrir: "El club todavía no está abierto a esa hora.",
  despues_de_cerrar: "El club ya está cerrado a esa hora.",
  no_cabe_en_un_dia: "Una reserva no puede cruzar la medianoche.",
  horario_mal_escrito:
    "El horario de operación del club está mal configurado. Avísale a la administración.",
};

/**
 * **El único lugar del sistema que escribe `field_booking`** (R-040-01).
 *
 * Prácticas, copas y clases van a reservar su cancha a través de aquí. Si cada módulo insertara por
 * su cuenta, la validación —cancha del club, cancha activa, horario de operación— tendría que
 * repetirse en cada uno, y bastaría con que uno la olvidara para que la regla dejara de existir en
 * ese camino.
 *
 * **Recibe la transacción, no la abre.** Crear una práctica y ocupar su cancha tienen que ser la
 * misma operación atómica: si fueran dos, existiría el estado «práctica sin cancha», y no habría
 * forma de saber si la reserva que falta se perdió o nunca se pidió.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async reservar(
    tx: Prisma.TransactionClient,
    clubId: string,
    datos: DatosDeReserva,
    creadaPor: string,
  ): Promise<{ id: string }> {
    const cancha = await this.exigirCanchaDisponible(tx, clubId, datos.fieldId);
    const rango = { inicio: datos.startsAt, fin: datos.endsAt };

    if (!esRangoValido(rango)) {
      // La base lo rechaza igual con su `CHECK`, pero con un error de PostgreSQL. Aquí sale con un
      // mensaje que quien lo lee puede corregir.
      throw new ApiException(
        "rango_invalido",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "La hora de fin tiene que ser posterior a la de inicio.",
      );
    }

    const dentroDelHorario = cabeEnElHorario(rango, await this.horario(clubId), cancha.club.timezone);

    if (!dentroDelHorario.ok) {
      throw new ApiException(
        "fuera_del_horario",
        HttpStatus.UNPROCESSABLE_ENTITY,
        MENSAJES_DE_HORARIO[dentroDelHorario.error],
      );
    }

    try {
      return await tx.fieldBooking.create({
        data: {
          clubId,
          fieldId: datos.fieldId,
          startsAt: datos.startsAt,
          endsAt: datos.endsAt,
          type: datos.type,
          visibility: datos.visibility ?? "public",
          sourceId: datos.sourceId ?? null,
          reason: datos.reason ?? null,
          createdById: creadaPor,
        },
        select: { id: true },
      });
    } catch (error) {
      if (esChoqueDeReservas(error)) {
        // Se busca **con qué** chocó para poder decirlo. La consulta va por fuera de `tx`: la
        // transacción ya está abortada por la violación, y cualquier consulta dentro de ella
        // fallaría con «current transaction is aborted».
        throw choqueDeReservas(
          await this.queOcupa(datos.fieldId, datos.startsAt, datos.endsAt),
          cancha.club.timezone,
        );
      }

      throw error;
    }
  }

  /**
   * Cancelar **no borra** (P-06): deja `cancelled_at`, que es lo que libera la franja para la
   * restricción de exclusión y a la vez conserva que esto existió.
   *
   * `updateMany` filtrando por club y por «sin cancelar»: cancelar algo ya cancelado es un éxito,
   * no un error —dos pestañas, dos toques— y una reserva de otro club sencillamente no existe
   * desde aquí (P-05).
   */
  async cancelar(clubId: string, bookingId: string): Promise<void> {
    return this.cancelarEn(this.prisma, clubId, bookingId);
  }

  /**
   * Lo mismo, **dentro de una transacción ajena**.
   *
   * Existe para `specs/050`: cancelar una práctica tiene que liberar la cancha **en la misma
   * transacción** que el cambio de estado (R-050-12). Con dos transacciones separadas, un fallo
   * entre medio deja una práctica cancelada con la cancha todavía ocupada, y eso se descubre
   * cuando alguien intenta programar ahí y no puede.
   */
  async cancelarEn(
    tx: Prisma.TransactionClient,
    clubId: string,
    bookingId: string,
  ): Promise<void> {
    const canceladas = await tx.fieldBooking.updateMany({
      where: { id: bookingId, clubId, cancelledAt: null },
      data: { cancelledAt: this.clock.now() },
    });

    if (canceladas.count === 0) {
      const existe = await tx.fieldBooking.count({ where: { id: bookingId, clubId } });

      if (existe === 0) {
        throw new NotFoundException();
      }
    }
  }

  /**
   * La cancha existe, es de este club y admite reservas.
   *
   * Una cancha archivada o en mantenimiento **no** las admite: el estado no es decorativo, es lo
   * que impide programar sobre una cancha que se está reparando (R-040-06).
   */
  private async exigirCanchaDisponible(
    tx: Prisma.TransactionClient,
    clubId: string,
    fieldId: string,
  ): Promise<{ status: string; club: { timezone: string } }> {
    const cancha = await tx.field.findFirst({
      where: { id: fieldId, clubId },
      select: { status: true, club: { select: { timezone: true } } },
    });

    if (cancha === null) {
      // De otro club, o inexistente: desde aquí son lo mismo (P-05).
      throw new NotFoundException();
    }

    if (cancha.status !== "active") {
      throw new ApiException(
        "cancha_no_disponible",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Esa cancha está fuera de servicio.",
      );
    }

    return cancha;
  }

  /** Qué ocupa esa franja hoy. Sólo lo que hace falta para explicar el choque. */
  private async queOcupa(
    fieldId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<{ startsAt: Date; endsAt: Date } | null> {
    return this.prisma.fieldBooking.findFirst({
      where: {
        fieldId,
        cancelledAt: null,
        // El mismo solapamiento que aplica la restricción, con la convención semiabierta: empieza
        // antes de que termine el nuevo y termina después de que el nuevo empieza.
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    });
  }

  private async horario(clubId: string): Promise<string> {
    const resuelto = await this.settings.leer(
      { scope: "club", clubId, organizationId: null },
      "field.operating_hours",
    );

    return typeof resuelto.value === "string" ? resuelto.value : "06:00-18:00";
  }
}
