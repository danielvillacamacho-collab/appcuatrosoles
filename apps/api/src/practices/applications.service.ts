import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ApplyToPracticeRequest } from "@polo/contracts";
import {
  estaAbiertaLaPostulacion,
  puedePostularse,
  validarHandicap,
  type Clock,
  type HandicapHalves,
} from "@polo/domain";
import { Prisma } from "@prisma/client";
import { CLOCK } from "../common/clock/clock.module.js";
import { ApiException } from "../common/errors/api-error.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { GuardianshipsService } from "../family/guardianships.service.js";
import { PracticesService } from "./practices.service.js";

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly practices: PracticesService,
    private readonly guardianships: GuardianshipsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Postularse (HU-050-02).
   *
   * **No decide cupos.** Quién queda dentro y quién en espera se calcula al leer (`plan.md` §0.1),
   * así que postularse es sólo entrar a la fila. Es lo que hace que no exista la carrera por el
   * último cupo: nadie compite por nada al escribir.
   */
  async postularse(
    clubId: string,
    practiceId: string,
    datos: ApplyToPracticeRequest,
    quien: { personId: string },
  ): Promise<void> {
    const practica = await this.practices.exigirDelClub(clubId, practiceId);
    const personId = await this.aQuienRepresenta(clubId, quien, datos.onBehalfOfPersonId);

    this.exigirAbierta(practica);

    const tope = await this.practices.topeDeEstudiante(personId);
    const puede = puedePostularse(
      { topeDeEstudiante: comoHandicap(tope) },
      { nivelMaximoHalves: comoHandicap(practica.maxLevelHalves) },
    );

    if (!puede.ok) {
      throw new ApiException(
        puede.error,
        HttpStatus.FORBIDDEN,
        puede.error === "supera_su_habilitacion"
          ? "Esta práctica es de un nivel superior al que te habilitaron."
          : "Esta práctica no declara su nivel, así que no se puede verificar que te corresponda.",
      );
    }

    if (datos.halfManPartnerPersonId !== undefined) {
      await this.exigirDelMismoClub(clubId, datos.halfManPartnerPersonId);
    }

    try {
      await this.prisma.practiceApplication.create({
        data: {
          clubId,
          practiceId,
          personId,
          chukkersOffered: datos.chukkersOffered,
          halfManPartnerPersonId: datos.halfManPartnerPersonId ?? null,
        },
      });
    } catch (error) {
      if (esPostulacionRepetida(error)) {
        throw new ApiException(
          "ya_estas_postulado",
          HttpStatus.CONFLICT,
          "Ya estás postulado a esta práctica.",
        );
      }

      throw error;
    }
  }

  /**
   * Retirarse (HU-050-03).
   *
   * Marca `withdrawn_at` en vez de borrar: quien se retiró puede volver a postularse, y entonces
   * entra **al final** de la fila. El índice único es parcial justamente para permitirlo.
   *
   * **No promueve a nadie**, y eso es la propiedad, no una omisión: el siguiente entra solo porque
   * el reparto se calcula al leer.
   */
  async retirarse(
    clubId: string,
    practiceId: string,
    quien: { personId: string },
    enNombreDe?: string,
  ): Promise<void> {
    const practica = await this.practices.exigirDelClub(clubId, practiceId);
    const personId = await this.aQuienRepresenta(clubId, quien, enNombreDe);

    this.exigirAbierta(practica);

    const retiradas = await this.prisma.practiceApplication.updateMany({
      where: { practiceId, personId, withdrawnAt: null },
      data: { withdrawnAt: this.clock.now() },
    });

    if (retiradas.count === 0) {
      throw new ApiException(
        "no_estas_postulado",
        HttpStatus.CONFLICT,
        "No estás postulado a esta práctica.",
      );
    }
  }

  /**
   * Aceptar compartir puesto (HU-050-05).
   *
   * Escribe **el otro lado** del vínculo. La pareja no existe hasta que los dos se nombran
   * mutuamente (R-050-08): si bastara con que uno nombrara al otro, cualquiera podría reservarle un
   * lugar a alguien que no se enteró.
   */
  async aceptarPareja(
    clubId: string,
    practiceId: string,
    quien: { personId: string },
    companeroPersonId: string,
  ): Promise<void> {
    const practica = await this.practices.exigirDelClub(clubId, practiceId);

    this.exigirAbierta(practica);

    const mia = practica.applications.find((una) => una.personId === quien.personId);

    if (mia === undefined) {
      throw new ApiException(
        "no_estas_postulado",
        HttpStatus.CONFLICT,
        "No estás postulado a esta práctica.",
      );
    }

    const suya = practica.applications.find((una) => una.personId === companeroPersonId);

    if (suya === undefined || suya.halfManPartnerPersonId !== quien.personId) {
      // Aceptar una propuesta que nadie hizo no forma pareja. Sin esta comprobación, cualquiera
      // podría emparejarse con quien quisiera con sólo escribir su identificador.
      throw new ApiException(
        "pareja_no_valida",
        HttpStatus.CONFLICT,
        "Esa persona no te propuso compartir puesto.",
      );
    }

    await this.prisma.practiceApplication.update({
      where: { id: mia.id },
      data: { halfManPartnerPersonId: companeroPersonId },
    });
  }

  /** Después del cierre no se entra ni se sale (R-050-09). */
  private exigirAbierta(practica: {
    status: string;
    applicationsCloseAt: Date;
  }): void {
    const abierta =
      practica.status === "published" &&
      estaAbiertaLaPostulacion({ closeAt: practica.applicationsCloseAt }, this.clock.now());

    if (!abierta) {
      throw new ApiException(
        "postulacion_cerrada",
        HttpStatus.CONFLICT,
        "Las postulaciones para esta práctica ya cerraron.",
      );
    }
  }

  /**
   * En nombre de quién se actúa.
   *
   * Sin `onBehalfOfPersonId`, uno mismo. Con él, **sólo si es un menor a su cargo**: un acudiente
   * postula a su hijo, y nadie postula a un tercero.
   */
  private async aQuienRepresenta(
    clubId: string,
    quien: { personId: string },
    enNombreDe: string | undefined,
  ): Promise<string> {
    if (enNombreDe === undefined || enNombreDe === quien.personId) {
      return quien.personId;
    }

    const aCargo = await this.guardianships.listarDependientesDe(clubId, quien.personId);

    if (!aCargo.some((dependiente) => dependiente.personId === enNombreDe)) {
      // 404 y no 403: confirmar que esa persona existe ya sería contar de más (P-05).
      throw new NotFoundException();
    }

    return enNombreDe;
  }

  private async exigirDelMismoClub(clubId: string, personId: string): Promise<void> {
    const persona = await this.prisma.person.findFirst({
      where: { id: personId, clubId },
      select: { id: true },
    });

    if (persona === null) {
      throw new NotFoundException();
    }
  }
}

/**
 * El índice único parcial `una_postulacion_vigente`, traducido.
 *
 * Se detecta por el **código** de Prisma y no por el texto del mensaje: el índice lo crea la
 * migración a mano, así que Prisma no lo conoce por nombre y su mensaje no lo menciona. Buscar el
 * texto daba un 500 en vez de un «ya estás postulado».
 */
function esPostulacionRepetida(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Ver la nota de `comoHandicap` en `practices.service.ts`: el tipo marcado obliga a validar. */
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
