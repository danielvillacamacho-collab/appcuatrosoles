import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { CreateGuardianshipRequest, GuardianshipResponse } from "@polo/contracts";
import { resolvePrimaryPayer, toLocalDate, type Clock } from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";

@Injectable()
export class GuardianshipsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Crear el vínculo acudiente–menor (T-070, HU-010-10).
   *
   * **Si el nuevo es pagador principal, se cierra el anterior en la misma transacción.** El
   * invariante «exactamente uno vigente» no cabe en un `CHECK` —depende de la fecha— así que lo
   * sostiene esta operación, más el índice único parcial de T-003 que impide dos vigentes a la vez.
   * Sin cerrar el anterior, la segunda inserción falla contra ese índice: la base no deja pasar el
   * error, pero el mensaje no le diría nada a nadie.
   */
  async crear(clubId: string, datos: CreateGuardianshipRequest): Promise<GuardianshipResponse> {
    await this.exigirPersonasDelClub(clubId, [datos.guardianPersonId, datos.dependentPersonId]);

    if (datos.guardianPersonId === datos.dependentPersonId) {
      throw new UnprocessableEntityException({ code: "nadie_es_acudiente_de_si_mismo" });
    }

    const startsOn = new Date(`${datos.startsOn}T00:00:00.000Z`);

    const creado = await this.prisma.$transaction(async (tx) => {
      if (datos.isPrimaryPayer) {
        await tx.guardianship.updateMany({
          where: { dependentPersonId: datos.dependentPersonId, isPrimaryPayer: true, endsOn: null },
          data: { endsOn: startsOn },
        });
      }

      return tx.guardianship.create({
        data: {
          clubId,
          guardianPersonId: datos.guardianPersonId,
          dependentPersonId: datos.dependentPersonId,
          isPrimaryPayer: datos.isPrimaryPayer,
          startsOn,
        },
      });
    });

    return aRespuesta(creado);
  }

  async listarDeDependiente(clubId: string, dependentPersonId: string): Promise<GuardianshipResponse[]> {
    const filas = await this.prisma.guardianship.findMany({
      where: { clubId, dependentPersonId },
      orderBy: { startsOn: "desc" },
    });

    return filas.map(aRespuesta);
  }

  /**
   * Job diario de integridad (T-071).
   *
   * Busca dependientes **activos** cuyo pagador principal no se pueda resolver, y devuelve el
   * motivo. Son dos casos, no uno —lo dejó anotado T-014—: ninguno vigente, o **dos distintos**
   * vigentes a la vez. El segundo bloquea cobros, así que es el más urgente.
   *
   * No corrige nada. Un job que arregla datos de familia por su cuenta decide quién paga, y eso lo
   * decide una persona.
   */
  async revisarIntegridadDePagadores(
    clubId: string,
    timezone: string,
  ): Promise<{ dependentPersonId: string; motivo: string }[]> {
    const hoy = toLocalDate(this.clock.now(), timezone);
    const dependientes = await this.prisma.guardianship.findMany({
      where: { clubId, dependent: { status: "active" } },
      select: {
        dependentPersonId: true,
        guardianPersonId: true,
        isPrimaryPayer: true,
        startsOn: true,
        endsOn: true,
      },
    });

    const porDependiente = new Map<string, typeof dependientes>();

    for (const vinculo of dependientes) {
      porDependiente.set(vinculo.dependentPersonId, [
        ...(porDependiente.get(vinculo.dependentPersonId) ?? []),
        vinculo,
      ]);
    }

    const problemas: { dependentPersonId: string; motivo: string }[] = [];

    for (const [dependentPersonId, vinculos] of porDependiente) {
      const resuelto = resolvePrimaryPayer(
        vinculos.map((vinculo) => ({
          guardianPersonId: vinculo.guardianPersonId,
          isPrimaryPayer: vinculo.isPrimaryPayer,
          startsOn: vinculo.startsOn.toISOString().slice(0, 10),
          endsOn: vinculo.endsOn === null ? null : vinculo.endsOn.toISOString().slice(0, 10),
        })),
        hoy,
      );

      if (!resuelto.ok) {
        problemas.push({ dependentPersonId, motivo: resuelto.error });
      }
    }

    return problemas;
  }

  private async exigirPersonasDelClub(clubId: string, ids: string[]): Promise<void> {
    const encontradas = await this.prisma.person.count({ where: { clubId, id: { in: ids } } });

    if (encontradas !== new Set(ids).size) {
      // Una persona de otro club no existe desde aquí (P-05).
      throw new NotFoundException();
    }
  }
}

function aRespuesta(fila: {
  id: string;
  guardianPersonId: string;
  dependentPersonId: string;
  isPrimaryPayer: boolean;
  startsOn: Date;
  endsOn: Date | null;
}): GuardianshipResponse {
  return {
    id: fila.id,
    guardianPersonId: fila.guardianPersonId,
    dependentPersonId: fila.dependentPersonId,
    isPrimaryPayer: fila.isPrimaryPayer,
    startsOn: fila.startsOn.toISOString().slice(0, 10),
    endsOn: fila.endsOn === null ? null : fila.endsOn.toISOString().slice(0, 10),
  };
}
