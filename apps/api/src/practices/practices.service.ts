import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreatePracticeRequest,
  PracticeResponse,
  UpdatePracticeRequest,
} from "@polo/contracts";
import {
  armarPuestos,
  estaAbiertaLaPostulacion,
  posicionDe,
  puedePostularse,
  repartirCupos,
  validarHandicap,
  validarParametrosDePractica,
  type Clock,
  type Postulacion,
  type Puesto,
  type HandicapHalves,
  type RechazoDeParametros,
} from "@polo/domain";
import type { Prisma } from "@prisma/client";
import { CLOCK } from "../common/clock/clock.module.js";
import { ApiException } from "../common/errors/api-error.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { BookingsService } from "../fields/bookings.service.js";

/** Quién mira, para poder decirle dónde quedó. */
export interface QuienMira {
  personId: string;
}

/** Lo que hace falta cargar de una práctica para responderla entera. */
const CON_TODO = {
  include: {
    field: { select: { name: true } },
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

type PracticaCompleta = Prisma.PracticeGetPayload<typeof CON_TODO>;

@Injectable()
export class PracticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async crear(
    clubId: string,
    datos: CreatePracticeRequest,
    creadaPor: string,
  ): Promise<PracticeResponse> {
    const parametros = aParametros(datos);
    const valida = validarParametrosDePractica(parametros);

    if (!valida.ok) {
      throw rechazoDeParametros(valida.error);
    }

    await this.exigirCanchaDelClub(clubId, datos.fieldId);

    const creada = await this.prisma.practice.create({
      data: {
        clubId,
        fieldId: datos.fieldId,
        startsAt: parametros.startsAt,
        endsAt: parametros.endsAt,
        chukkers: datos.chukkers,
        handicapType: datos.handicapType,
        suggestedMinHalves: datos.suggestedMinHalves ?? null,
        suggestedMaxHalves: datos.suggestedMaxHalves ?? null,
        maxLevelHalves: datos.maxLevelHalves ?? null,
        targetPlayers: datos.targetPlayers,
        minPlayers: datos.minPlayers,
        applicationsCloseAt: parametros.applicationsCloseAt,
        decisionAt: parametros.decisionAt,
        createdById: creadaPor,
      },
      ...CON_TODO,
    });

    return this.comoRespuesta(creada, null);
  }

  /**
   * Editar.
   *
   * **Sólo en borrador o publicada.** Una práctica confirmada o cancelada ya produjo decisiones de
   * otras personas —quién preparó caballos, quién no— y cambiarle la hora por debajo sería mentir
   * sobre algo que ya pasó.
   */
  async actualizar(
    clubId: string,
    id: string,
    cambios: UpdatePracticeRequest,
  ): Promise<PracticeResponse> {
    const actual = await this.exigirDelClub(clubId, id);

    if (actual.status !== "draft" && actual.status !== "published") {
      throw new ApiException(
        "practica_no_editable",
        HttpStatus.CONFLICT,
        "Esta práctica ya no se puede editar.",
      );
    }

    const parametros = aParametros({
      startsAt: cambios.startsAt ?? actual.startsAt.toISOString(),
      endsAt: cambios.endsAt ?? actual.endsAt.toISOString(),
      targetPlayers: cambios.targetPlayers ?? actual.targetPlayers,
      minPlayers: cambios.minPlayers ?? actual.minPlayers,
      applicationsCloseAt:
        cambios.applicationsCloseAt ?? actual.applicationsCloseAt.toISOString(),
      decisionAt: cambios.decisionAt ?? actual.decisionAt.toISOString(),
    });
    const valida = validarParametrosDePractica(parametros);

    if (!valida.ok) {
      throw rechazoDeParametros(valida.error);
    }

    const actualizada = await this.prisma.practice.update({
      where: { id },
      data: {
        ...(cambios.chukkers === undefined ? {} : { chukkers: cambios.chukkers }),
        ...(cambios.handicapType === undefined ? {} : { handicapType: cambios.handicapType }),
        ...(cambios.suggestedMinHalves === undefined
          ? {}
          : { suggestedMinHalves: cambios.suggestedMinHalves }),
        ...(cambios.suggestedMaxHalves === undefined
          ? {}
          : { suggestedMaxHalves: cambios.suggestedMaxHalves }),
        ...(cambios.maxLevelHalves === undefined ? {} : { maxLevelHalves: cambios.maxLevelHalves }),
        startsAt: parametros.startsAt,
        endsAt: parametros.endsAt,
        targetPlayers: parametros.targetPlayers,
        minPlayers: parametros.minPlayers,
        applicationsCloseAt: parametros.applicationsCloseAt,
        decisionAt: parametros.decisionAt,
      },
      ...CON_TODO,
    });

    return this.comoRespuesta(actualizada, null);
  }

  /**
   * Publicar: **la cancha se reserva en la misma transacción** (R-050-01).
   *
   * Si la franja está ocupada, la reserva falla, la transacción se deshace y la práctica **sigue en
   * borrador**. Es lo que impide que exista una práctica publicada sin cancha, que es la clase de
   * inconsistencia que se descubre el día de la práctica.
   */
  async publicar(clubId: string, id: string, publicadaPor: string): Promise<PracticeResponse> {
    const practica = await this.exigirDelClub(clubId, id);

    if (practica.status !== "draft") {
      throw new ApiException(
        "practica_ya_publicada",
        HttpStatus.CONFLICT,
        "Esta práctica ya está publicada.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const reserva = await this.bookings.reservar(
        tx,
        clubId,
        {
          fieldId: practica.fieldId,
          startsAt: practica.startsAt,
          endsAt: practica.endsAt,
          type: "practice",
          // Una práctica es actividad del club: se ve entera en el calendario (`specs/040`).
          visibility: "public",
          sourceId: practica.id,
        },
        publicadaPor,
      );

      await tx.practice.update({
        where: { id },
        data: { status: "published", fieldBookingId: reserva.id },
      });
    });

    return this.detalle(clubId, id, null);
  }

  /** Cancelar: **libera la cancha en la misma transacción** (R-050-12). */
  async cancelar(clubId: string, id: string, motivo: string): Promise<PracticeResponse> {
    const practica = await this.exigirDelClub(clubId, id);

    if (practica.status === "cancelled") {
      return this.detalle(clubId, id, null);
    }

    await this.prisma.$transaction(async (tx) => {
      if (practica.fieldBookingId !== null) {
        await this.bookings.cancelarEn(tx, clubId, practica.fieldBookingId);
      }

      await tx.practice.update({
        where: { id },
        data: {
          status: "cancelled",
          cancellationReason: motivo,
          decidedAt: this.clock.now(),
        },
      });
    });

    return this.detalle(clubId, id, null);
  }

  /**
   * Las prácticas que **esta persona** puede ver, entre dos fechas.
   *
   * El filtro del estudiante se aplica aquí y también en el detalle: quitarlo del listado no basta,
   * porque el enlace directo sigue funcionando (R-050-05).
   */
  async listar(
    clubId: string,
    quien: QuienMira | null,
    rango: { desde: Date; hasta: Date },
  ): Promise<PracticeResponse[]> {
    const practicas = await this.prisma.practice.findMany({
      where: {
        clubId,
        // Un borrador no existe para nadie más (R-050-03).
        status: { not: "draft" },
        startsAt: { gte: rango.desde, lt: rango.hasta },
      },
      orderBy: { startsAt: "asc" },
      ...CON_TODO,
    });

    const tope = quien === null ? null : await this.topeDeEstudiante(quien.personId);

    return practicas
      .filter(
        (practica) =>
          puedePostularse({ topeDeEstudiante: comoHandicap(tope) }, aPracticaParaPostular(practica)).ok,
      )
      .map((practica) => this.comoRespuesta(practica, quien));
  }

  async detalle(clubId: string, id: string, quien: QuienMira | null): Promise<PracticeResponse> {
    const practica = await this.exigirDelClub(clubId, id);

    if (quien !== null) {
      const tope = await this.topeDeEstudiante(quien.personId);
      const puede = puedePostularse(
        { topeDeEstudiante: comoHandicap(tope) },
        aPracticaParaPostular(practica),
      );

      if (!puede.ok) {
        // **404 y no 403**: decir «no podés ver ésta» ya revela que existe y de qué nivel es.
        throw new NotFoundException();
      }
    }

    return this.comoRespuesta(practica, quien);
  }

  /** La práctica, con sus postulaciones vigentes, filtrada por club. 404 si no es de aquí (P-05). */
  async exigirDelClub(clubId: string, id: string): Promise<PracticaCompleta> {
    const practica = await this.prisma.practice.findFirst({ where: { id, clubId }, ...CON_TODO });

    if (practica === null) {
      throw new NotFoundException();
    }

    return practica;
  }

  /** El tope vigente de un estudiante, o `null` si no tiene habilitación. */
  async topeDeEstudiante(personId: string): Promise<number | null> {
    const habilitacion = await this.prisma.practiceEligibility.findFirst({
      where: { personId, revokedAt: null },
      orderBy: { grantedAt: "desc" },
      select: { maxHandicapHalves: true },
    });

    return habilitacion?.maxHandicapHalves ?? null;
  }

  private async exigirCanchaDelClub(clubId: string, fieldId: string): Promise<void> {
    const cancha = await this.prisma.field.findFirst({
      where: { id: fieldId, clubId },
      select: { id: true },
    });

    if (cancha === null) {
      throw new NotFoundException();
    }
  }

  /**
   * La práctica como la ve quien pregunta.
   *
   * **Aquí es donde el reparto se calcula en vez de leerse** (`plan.md` §0.1): se arman los puestos,
   * se cortan por los cupos, y se busca dónde quedó quien mira.
   */
  private comoRespuesta(practica: PracticaCompleta, quien: QuienMira | null): PracticeResponse {
    const postulaciones: Postulacion[] = practica.applications.map((una) => ({
      id: una.id,
      personId: una.personId,
      appliedAt: una.appliedAt,
      chukkersOffered: una.chukkersOffered,
      halfManPartnerPersonId: una.halfManPartnerPersonId,
    }));

    const reparto = repartirCupos(armarPuestos(postulaciones), practica.targetPlayers);
    const nombres = new Map(
      practica.applications.map((una) => [una.personId, una.person.fullName]),
    );
    const mio = quien === null ? null : posicionDe(quien.personId, reparto);
    const miPostulacion = practica.applications.find(
      (una) => una.personId === quien?.personId,
    );

    return {
      id: practica.id,
      fieldId: practica.fieldId,
      fieldName: practica.field.name,
      startsAt: practica.startsAt.toISOString(),
      endsAt: practica.endsAt.toISOString(),
      chukkers: practica.chukkers,
      handicapType: practica.handicapType,
      suggestedMinHalves: practica.suggestedMinHalves,
      suggestedMaxHalves: practica.suggestedMaxHalves,
      maxLevelHalves: practica.maxLevelHalves,
      targetPlayers: practica.targetPlayers,
      minPlayers: practica.minPlayers,
      applicationsCloseAt: practica.applicationsCloseAt.toISOString(),
      decisionAt: practica.decisionAt.toISOString(),
      status: practica.status,
      cancellationReason: practica.cancellationReason,

      puestosDentro: reparto.dentro.length,
      puestosEnEspera: reparto.enEspera.length,
      abierta:
        practica.status === "published" &&
        estaAbiertaLaPostulacion({ closeAt: practica.applicationsCloseAt }, this.clock.now()),

      miPostulacion:
        mio === null || miPostulacion === undefined
          ? null
          : {
              estado: mio.estado,
              posicion: mio.posicion,
              chukkersOffered: miPostulacion.chukkersOffered,
              medioHombre: elMedioHombreDe(miPostulacion.personId, reparto, nombres, miPostulacion),
            },

      postulados: [...reparto.dentro, ...reparto.enEspera].flatMap((puesto, indice) =>
        comoPostulados(puesto, indice, reparto.dentro.length, nombres),
      ),
    };
  }
}

/** Cada persona del puesto, con la posición **del puesto**: los dos de una pareja la comparten. */
function comoPostulados(
  puesto: Puesto,
  indice: number,
  cuantosDentro: number,
  nombres: ReadonlyMap<string, string>,
): PracticeResponse["postulados"] {
  const dentro = indice < cuantosDentro;
  const estado = dentro ? ("dentro" as const) : ("en_espera" as const);
  const posicion = dentro ? indice + 1 : indice - cuantosDentro + 1;

  const fila = (quien: Postulacion, companero: Postulacion | null): PracticeResponse["postulados"][number] => ({
    personId: quien.personId,
    fullName: nombres.get(quien.personId) ?? "",
    chukkersOffered: quien.chukkersOffered,
    estado,
    posicion,
    companero:
      companero === null
        ? null
        : { personId: companero.personId, fullName: nombres.get(companero.personId) ?? "" },
  });

  return puesto.companero === null
    ? [fila(puesto.titular, null)]
    : [fila(puesto.titular, puesto.companero), fila(puesto.companero, puesto.titular)];
}

/**
 * El medio hombre de quien mira: a quién propuso, y **si la pareja está formada**.
 *
 * Una propuesta sin aceptar se muestra igual, con `aceptada: false`. Esconderla dejaría a quien
 * propuso sin saber si su compañero respondió, que es exactamente lo que necesita saber.
 */
function elMedioHombreDe(
  personId: string,
  reparto: { dentro: readonly Puesto[]; enEspera: readonly Puesto[] },
  nombres: ReadonlyMap<string, string>,
  miPostulacion: { halfManPartnerPersonId: string | null },
): { personId: string; fullName: string; aceptada: boolean } | null {
  if (miPostulacion.halfManPartnerPersonId === null) {
    return null;
  }

  const formada = [...reparto.dentro, ...reparto.enEspera].some(
    (puesto) =>
      puesto.companero !== null &&
      (puesto.titular.personId === personId || puesto.companero.personId === personId),
  );

  return {
    personId: miPostulacion.halfManPartnerPersonId,
    fullName: nombres.get(miPostulacion.halfManPartnerPersonId) ?? "",
    aceptada: formada,
  };
}

function aParametros(datos: {
  startsAt: string;
  endsAt: string;
  targetPlayers: number;
  minPlayers: number;
  applicationsCloseAt: string;
  decisionAt: string;
}): {
  startsAt: Date;
  endsAt: Date;
  targetPlayers: number;
  minPlayers: number;
  applicationsCloseAt: Date;
  decisionAt: Date;
} {
  return {
    startsAt: new Date(datos.startsAt),
    endsAt: new Date(datos.endsAt),
    targetPlayers: datos.targetPlayers,
    minPlayers: datos.minPlayers,
    applicationsCloseAt: new Date(datos.applicationsCloseAt),
    decisionAt: new Date(datos.decisionAt),
  };
}

function aPracticaParaPostular(practica: { maxLevelHalves: number | null }): {
  nivelMaximoHalves: HandicapHalves | null;
} {
  return { nivelMaximoHalves: comoHandicap(practica.maxLevelHalves) };
}

/**
 * Un número de la base convertido en handicap **validado**.
 *
 * Hace falta porque `HandicapHalves` está marcado: un `number` cualquiera no entra donde va un
 * handicap, y eso obliga a decir explícitamente de dónde salió. Cuando el compilador lo pidió aquí,
 * el tipo estaba haciendo exactamente su trabajo.
 *
 * Un valor corrupto en la base **se hace notar**: seguir con él lo propagaría a una decisión de
 * elegibilidad, que es donde peor se paga.
 */
function comoHandicap(valor: number | null): HandicapHalves | null {
  if (valor === null) {
    return null;
  }

  const validado = validarHandicap(valor);

  if (!validado.ok) {
    throw new Error(`Handicap corrupto en la base: ${valor} (${validado.error}).`);
  }

  return validado.value;
}

/** Cada rechazo del dominio con su código, para que la pantalla explique cuál falló. */
function rechazoDeParametros(razon: RechazoDeParametros): ApiException {
  const mensajes: Record<RechazoDeParametros, string> = {
    rango_invalido: "La hora de fin tiene que ser posterior a la de inicio.",
    minimo_mayor_que_objetivo: "El mínimo no puede ser mayor que el objetivo.",
    cierre_despues_de_decision: "El cierre tiene que ser antes de la hora de decisión.",
    decision_despues_de_empezar: "La decisión tiene que ser antes de que empiece la práctica.",
  };

  return new ApiException(`practica_${razon}`, HttpStatus.UNPROCESSABLE_ENTITY, mensajes[razon]);
}
