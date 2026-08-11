import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateFieldRequest, FieldResponse, UpdateFieldRequest } from "@polo/contracts";
import { Prisma } from "@prisma/client";
import { ApiException } from "../common/errors/api-error.js";
import { PrismaService } from "../common/prisma/prisma.service.js";

@Injectable()
export class FieldsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Las canchas del club.
   *
   * **Las archivadas no se listan por defecto** pero se pueden pedir: quien mira el calendario de
   * marzo necesita saber en qué cancha fue esa práctica, aunque la cancha ya no exista para
   * programar.
   */
  async listar(clubId: string, incluirArchivadas = false): Promise<FieldResponse[]> {
    const canchas = await this.prisma.field.findMany({
      where: { clubId, ...(incluirArchivadas ? {} : { status: { not: "archived" } }) },
      orderBy: { name: "asc" },
      select: SELECCION,
    });

    return canchas;
  }

  async crear(clubId: string, datos: CreateFieldRequest): Promise<FieldResponse> {
    try {
      return await this.prisma.field.create({
        data: {
          clubId,
          name: datos.name,
          ...(datos.surface === undefined ? {} : { surface: datos.surface }),
          ...(datos.capacityNotes === undefined ? {} : { capacityNotes: datos.capacityNotes }),
        },
        select: SELECCION,
      });
    } catch (error) {
      throw this.traducirNombreRepetido(error);
    }
  }

  async actualizar(clubId: string, id: string, cambios: UpdateFieldRequest): Promise<FieldResponse> {
    await this.exigirDelClub(clubId, id);

    try {
      return await this.prisma.field.update({
        where: { id },
        data: {
          ...(cambios.name === undefined ? {} : { name: cambios.name }),
          ...(cambios.surface === undefined ? {} : { surface: cambios.surface }),
          ...(cambios.capacityNotes === undefined ? {} : { capacityNotes: cambios.capacityNotes }),
          ...(cambios.status === undefined ? {} : { status: cambios.status }),
        },
        select: SELECCION,
      });
    } catch (error) {
      throw this.traducirNombreRepetido(error);
    }
  }

  /**
   * Archivar **no borra** (P-06, R-040-08).
   *
   * Lo ya programado en esa cancha sigue existiendo y sigue viéndose en el calendario: una práctica
   * del año pasado no puede quedar apuntando a la nada. Lo que cambia es que no admite reservas
   * nuevas, y eso lo comprueba `BookingsService`.
   */
  async archivar(clubId: string, id: string): Promise<FieldResponse> {
    await this.exigirDelClub(clubId, id);

    return this.prisma.field.update({
      where: { id },
      data: { status: "archived" },
      select: SELECCION,
    });
  }

  async detalle(clubId: string, id: string): Promise<FieldResponse> {
    return this.exigirDelClub(clubId, id);
  }

  private async exigirDelClub(clubId: string, id: string): Promise<FieldResponse> {
    const cancha = await this.prisma.field.findFirst({ where: { id, clubId }, select: SELECCION });

    if (cancha === null) {
      // De otro club, o inexistente: desde aquí son lo mismo (P-05).
      throw new NotFoundException();
    }

    return cancha;
  }

  /**
   * El índice único de `(club_id, name)` es la garantía; esto sólo la cuenta.
   *
   * Comprobar antes con un `findFirst` sería una condición de carrera: dos administradores creando
   * «Cancha 4» a la vez pasarían los dos la comprobación. La base decide, y aquí se traduce.
   */
  private traducirNombreRepetido(error: unknown): unknown {
    const esNombreRepetido =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      String(error.meta?.["target"] ?? "").includes("name");

    return esNombreRepetido
      ? new ApiException(
          "nombre_de_cancha_en_uso",
          HttpStatus.CONFLICT,
          "Ya hay una cancha con ese nombre en el club.",
        )
      : error;
  }
}

const SELECCION = {
  id: true,
  name: true,
  surface: true,
  capacityNotes: true,
  status: true,
} satisfies Prisma.FieldSelect;
