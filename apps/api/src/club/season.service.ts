import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateSeasonRequest, SeasonResponse } from "@polo/contracts";
import type { Clock } from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";

/** Violación de una restricción de exclusión en PostgreSQL. Es el `EXCLUDE` de T-201. */
const CODIGO_EXCLUSION = "23P01";

@Injectable()
export class SeasonService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listar(clubId: string): Promise<SeasonResponse[]> {
    const filas = await this.prisma.season.findMany({
      where: { clubId },
      orderBy: { startsOn: "desc" },
    });

    return filas.map(aRespuesta);
  }

  /**
   * Crear una temporada.
   *
   * **El solapamiento lo rechaza la base, no este servicio** (R-020-06, T-201): dos solicitudes
   * simultáneas leerían «no hay solapamiento» y las dos insertarían. Aquí sólo se traduce el error
   * del motor a un `409` con su código — comprobarlo antes además sería una carrera con nombre.
   */
  async crear(clubId: string, datos: CreateSeasonRequest): Promise<SeasonResponse> {
    const startsOn = new Date(`${datos.startsOn}T00:00:00.000Z`);
    const endsOn = new Date(`${datos.endsOn}T00:00:00.000Z`);

    if (endsOn.getTime() < startsOn.getTime()) {
      throw new UnprocessableEntityException({ code: "fechas_incoherentes" });
    }

    try {
      const creada = await this.prisma.season.create({
        data: { clubId, name: datos.name, startsOn, endsOn },
      });

      return aRespuesta(creada);
    } catch (error) {
      if (esViolacionDeExclusion(error)) {
        throw new ConflictException({ code: "temporada_solapada" });
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "nombre_en_uso" });
      }

      throw error;
    }
  }

  /**
   * Cerrar una temporada. La historia queda consultable y no se registra actividad nueva en ella.
   *
   * `spec.md` HU-020-06 pide además que cerrar exija que no queden prácticas ni copas abiertas.
   * **Esa comprobación está declarada y vacía**: esas tablas las crean `specs/050` y `specs/060`.
   * Está escrita así, con su nombre, para que quien construya prácticas la encuentre — un
   * comentario suelto se habría perdido.
   */
  async cerrar(clubId: string, id: string): Promise<SeasonResponse> {
    const temporada = await this.prisma.season.findFirst({ where: { id, clubId } });

    if (temporada === null) {
      throw new NotFoundException();
    }

    if (temporada.status === "closed") {
      throw new ConflictException({ code: "temporada_ya_cerrada" });
    }

    await this.exigirQueNoQuedeActividadAbierta();

    const cerrada = await this.prisma.season.update({
      where: { id },
      data: { status: "closed", closedAt: this.clock.now() },
    });

    return aRespuesta(cerrada);
  }

  /** Ver la nota de `cerrar`. Entra con `specs/050` (prácticas) y `specs/060` (copas). */
  private async exigirQueNoQuedeActividadAbierta(): Promise<void> {
    return Promise.resolve();
  }
}

function esViolacionDeExclusion(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientUnknownRequestError)) {
    return false;
  }

  return error.message.includes(CODIGO_EXCLUSION) || error.message.includes("season_sin_solapamiento");
}

function aRespuesta(fila: {
  id: string;
  name: string;
  startsOn: Date;
  endsOn: Date;
  status: "open" | "closed";
}): SeasonResponse {
  return {
    id: fila.id,
    name: fila.name,
    // `toISOString().slice(0, 10)` y no una conversión con zona: la columna es `date` y se guardó
    // como medianoche UTC. Aplicarle una zona aquí la correría un día (la lección de T-014).
    startsOn: fila.startsOn.toISOString().slice(0, 10),
    endsOn: fila.endsOn.toISOString().slice(0, 10),
    status: fila.status,
  };
}
