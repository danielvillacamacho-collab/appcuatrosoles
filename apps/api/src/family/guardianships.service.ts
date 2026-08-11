import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type {
  CreateGuardianshipRequest,
  CreateMinorRequest,
  DependentResponse,
  GuardianshipResponse,
} from "@polo/contracts";
import { cabeEnPerfilDeMenor, resolvePrimaryPayer, toLocalDate, type Clock } from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { WaiversService } from "./waivers.service.js";

@Injectable()
export class GuardianshipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly waivers: WaiversService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Crear el perfil de un menor sin cuenta, con su acudiente, en una sola transacción (T-076).
   *
   * **Persona y vínculo se crean juntos o no se crea ninguno.** Un menor sin acudiente es el estado
   * roto que persigue el job de T-071: existe en el club, se le puede cobrar, y no hay a quién
   * cobrarle. Partirlo en dos llamadas es dejar que la segunda no ocurra —porque se cayó la red,
   * porque el formulario falló— y que nadie se entere hasta que haya plata de por medio.
   *
   * No crea `UserAccount`, y eso es la funcionalidad, no una omisión: el menor no tiene contraseña
   * ni correo de acceso. Quien entra a la plataforma por él es su acudiente.
   */
  async crearMenor(
    clubId: string,
    datos: CreateMinorRequest,
    actorUserAccountId: string,
  ): Promise<DependentResponse> {
    await this.exigirPersonasDelClub(clubId, [datos.guardianPersonId]);

    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
      select: { timezone: true },
    });
    const hoy = toLocalDate(this.clock.now(), club.timezone);
    const edadMaxima = await this.edadMaximaDeMenor(clubId);

    if (!cabeEnPerfilDeMenor(datos.birthdate, hoy, edadMaxima)) {
      // Un perfil de menor es una persona **sin cuenta propia**, administrada por otro. Dejar crear
      // uno para un adulto es dejar que alguien administre la vida deportiva de alguien que debería
      // tener su propia contraseña.
      throw new UnprocessableEntityException({ code: "no_cabe_en_perfil_de_menor", edadMaxima });
    }

    if (datos.membershipCategoryId !== undefined) {
      await this.exigirCategoriaDelClub(clubId, datos.membershipCategoryId);
    }

    const menor = await this.prisma.$transaction(async (tx) => {
      const persona = await tx.person.create({
        data: {
          clubId,
          fullName: datos.fullName,
          birthdate: new Date(`${datos.birthdate}T00:00:00.000Z`),
          isMinor: true,
          ...(datos.email === undefined ? {} : { email: datos.email }),
          ...(datos.phone === undefined ? {} : { phone: datos.phone }),
          createdById: actorUserAccountId,
        },
      });

      await tx.guardianship.create({
        data: {
          clubId,
          guardianPersonId: datos.guardianPersonId,
          dependentPersonId: persona.id,
          isPrimaryPayer: datos.isPrimaryPayer,
          startsOn: new Date(`${hoy}T00:00:00.000Z`),
        },
      });

      if (datos.membershipCategoryId !== undefined) {
        await tx.membershipAssignment.create({
          data: {
            clubId,
            personId: persona.id,
            membershipCategoryId: datos.membershipCategoryId,
            effectiveFrom: new Date(`${hoy}T00:00:00.000Z`),
            assignedById: actorUserAccountId,
          },
        });
      }

      return persona;
    });

    const [respuesta] = await this.armarDependientes(clubId, [
      { personId: menor.id, isPrimaryPayer: datos.isPrimaryPayer },
    ]);

    if (respuesta === undefined) {
      throw new NotFoundException();
    }

    return respuesta;
  }

  /**
   * Los perfiles a cargo de quien pregunta (`spec.md` §10, T-076).
   *
   * **Sólo los vínculos vigentes**: un acudiente que dejó de serlo el mes pasado no tiene por qué
   * seguir viendo la ficha del menor. `endsOn` nulo o futuro es lo que define «vigente», y se
   * compara con la fecha de calendario del club, no con un instante — ver `LocalDate`.
   */
  async listarDependientesDe(clubId: string, guardianPersonId: string): Promise<DependentResponse[]> {
    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
      select: { timezone: true },
    });
    const hoy = new Date(`${toLocalDate(this.clock.now(), club.timezone)}T00:00:00.000Z`);

    const vinculos = await this.prisma.guardianship.findMany({
      where: {
        clubId,
        guardianPersonId,
        startsOn: { lte: hoy },
        OR: [{ endsOn: null }, { endsOn: { gt: hoy } }],
      },
      select: { dependentPersonId: true, isPrimaryPayer: true },
    });

    return this.armarDependientes(
      clubId,
      vinculos.map((vinculo) => ({
        personId: vinculo.dependentPersonId,
        isPrimaryPayer: vinculo.isPrimaryPayer,
      })),
    );
  }

  private async armarDependientes(
    clubId: string,
    vinculos: { personId: string; isPrimaryPayer: boolean }[],
  ): Promise<DependentResponse[]> {
    if (vinculos.length === 0) {
      return [];
    }

    const personas = await this.prisma.person.findMany({
      where: { clubId, id: { in: vinculos.map((vinculo) => vinculo.personId) } },
      select: {
        id: true,
        fullName: true,
        birthdate: true,
        isMinor: true,
        status: true,
        // `effectiveTo` nulo es «vigente hoy»: es la misma convención que usa el listado de
        // usuarios, y comparar la columna `date` contra un instante sería el error que `LocalDate`
        // existe para evitar.
        membershipHistory: {
          where: { effectiveTo: null },
          orderBy: { effectiveFrom: "desc" },
          take: 1,
          select: { category: { select: { code: true, name: true } } },
        },
      },
      orderBy: { fullName: "asc" },
    });

    return Promise.all(
      personas.map(async (persona) => {
        const categoria = persona.membershipHistory[0]?.category ?? null;

        return {
          personId: persona.id,
          fullName: persona.fullName,
          birthdate: persona.birthdate === null ? null : persona.birthdate.toISOString().slice(0, 10),
          isMinor: persona.isMinor,
          status: persona.status,
          isPrimaryPayer:
            vinculos.find((vinculo) => vinculo.personId === persona.id)?.isPrimaryPayer ?? false,
          membershipCategory: categoria,
          waiverAccepted: await this.waivers.tieneWaiverVigente(clubId, persona.id),
        };
      }),
    );
  }

  private async edadMaximaDeMenor(clubId: string): Promise<number> {
    const resuelto = await this.settings.leer(
      { scope: "club", clubId, organizationId: null },
      "identity.minor_profile_max_age",
    );

    return typeof resuelto.value === "number" ? resuelto.value : 18;
  }

  private async exigirCategoriaDelClub(clubId: string, membershipCategoryId: string): Promise<void> {
    const existe = await this.prisma.membershipCategory.count({
      where: { clubId, id: membershipCategoryId },
    });

    if (existe === 0) {
      throw new NotFoundException();
    }
  }

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
