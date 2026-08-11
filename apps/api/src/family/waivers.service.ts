import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { WaiverResponse } from "@polo/contracts";
import { isWaiverAcceptanceCurrent, type Clock } from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";

@Injectable()
export class WaiversService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** La versión vigente: la de mayor correlativo ya publicada (T-073, `schema.prisma`). */
  async vigente(clubId: string): Promise<WaiverResponse> {
    const version = await this.prisma.waiverVersion.findFirst({
      where: { clubId, publishedAt: { lte: this.clock.now() } },
      orderBy: { version: "desc" },
    });

    if (version === null) {
      throw new NotFoundException();
    }

    return {
      id: version.id,
      version: version.version,
      body: version.body,
      publishedAt: version.publishedAt.toISOString(),
    };
  }

  /**
   * Publicar una versión nueva (T-073).
   *
   * El correlativo se calcula dentro de la transacción y la base tiene `@@unique([clubId, version])`:
   * si dos administradores publicaran a la vez, una de las dos falla en vez de compartir número.
   */
  async publicar(clubId: string, texto: string, actorUserId: string): Promise<WaiverResponse> {
    const creada = await this.prisma.$transaction(async (tx) => {
      const ultima = await tx.waiverVersion.findFirst({
        where: { clubId },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      return tx.waiverVersion.create({
        data: {
          clubId,
          version: (ultima?.version ?? 0) + 1,
          body: texto,
          publishedAt: this.clock.now(),
          createdById: actorUserId,
        },
      });
    });

    return {
      id: creada.id,
      version: creada.version,
      body: creada.body,
      publishedAt: creada.publishedAt.toISOString(),
    };
  }

  /**
   * Aceptar el waiver vigente, en nombre propio o de un menor a cargo (T-074, HU-010-11).
   *
   * Aceptar por otra persona exige ser su acudiente **vigente**: sin esa comprobación, cualquiera
   * podría firmar por cualquiera, y la aceptación es evidencia legal.
   */
  async aceptar(clubId: string, personaQueAcepta: string, personaCubierta: string): Promise<void> {
    const vigente = await this.vigente(clubId);

    if (personaQueAcepta !== personaCubierta) {
      const hoy = this.clock.now();
      const vinculo = await this.prisma.guardianship.findFirst({
        where: {
          clubId,
          guardianPersonId: personaQueAcepta,
          dependentPersonId: personaCubierta,
          startsOn: { lte: hoy },
          OR: [{ endsOn: null }, { endsOn: { gte: hoy } }],
        },
      });

      if (vinculo === null) {
        throw new ForbiddenException({ code: "no_eres_su_acudiente" });
      }
    }

    await this.prisma.waiverAcceptance.upsert({
      // Una persona acepta una versión **una sola vez**: aceptarla dos veces no significa nada, y
      // el índice único de `schema.prisma` lo garantiza. El `upsert` evita que un doble clic en el
      // celular termine en un error que no le dice nada a nadie.
      where: { personId_waiverVersionId: { personId: personaCubierta, waiverVersionId: vigente.id } },
      create: {
        clubId,
        personId: personaCubierta,
        acceptedByPersonId: personaQueAcepta,
        waiverVersionId: vigente.id,
      },
      update: {},
    });
  }

  /**
   * ¿Tiene esta persona aceptación vigente? (T-075, R-010-12)
   *
   * **Es el ayudante reutilizable que pide la tarea**: prácticas, clases y todo lo que exija waiver
   * lo llaman en vez de reimplementar la regla. La decisión en sí vive en el dominio
   * (`isWaiverAcceptanceCurrent`, T-013); esto es la consulta que le da los datos.
   */
  async tieneWaiverVigente(clubId: string, personId: string): Promise<boolean> {
    const version = await this.prisma.waiverVersion.findFirst({
      where: { clubId, publishedAt: { lte: this.clock.now() } },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    if (version === null) {
      // Sin waiver publicado no hay nada que aceptar: el club todavía no lo exige.
      return true;
    }

    const aceptacion = await this.prisma.waiverAcceptance.findFirst({
      where: { personId, clubId },
      orderBy: { acceptedAt: "desc" },
      select: { waiverVersionId: true },
    });

    return isWaiverAcceptanceCurrent(aceptacion, version);
  }

  /** Para los módulos que lo exigen (T-075): lanza en vez de devolver, para no repetir el `if`. */
  async exigirWaiverVigente(clubId: string, personId: string): Promise<void> {
    if (!(await this.tieneWaiverVigente(clubId, personId))) {
      throw new ForbiddenException({ code: "waiver_no_aceptado" });
    }
  }
}
