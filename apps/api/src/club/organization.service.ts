import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateOrganizationRequest,
  OrganizationResponse,
  UpdateOrganizationRequest,
} from "@polo/contracts";
import type { Clock } from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listar(clubId: string): Promise<OrganizationResponse[]> {
    const filas = await this.prisma.organization.findMany({
      // Toda consulta de esta capa lleva su `club_id`: el filtro de tenant vive en el repositorio,
      // no en el controlador (P-05). Sin él, listar organizaciones listaría las de todos.
      where: { clubId },
      orderBy: { name: "asc" },
    });

    return filas.map(aRespuesta);
  }

  async crear(clubId: string, datos: CreateOrganizationRequest): Promise<OrganizationResponse> {
    const repetida = await this.prisma.organization.findFirst({
      where: { clubId, name: datos.name },
    });

    if (repetida !== null) {
      throw new ConflictException({ code: "nombre_en_uso" });
    }

    const creada = await this.prisma.organization.create({
      data: { clubId, name: datos.name, type: datos.type },
    });

    return aRespuesta(creada);
  }

  async actualizar(
    clubId: string,
    id: string,
    cambios: UpdateOrganizationRequest,
  ): Promise<OrganizationResponse> {
    await this.exigirQueSeaDelClub(clubId, id);

    const actualizada = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(cambios.name === undefined ? {} : { name: cambios.name }),
        ...(cambios.type === undefined ? {} : { type: cambios.type }),
      },
    });

    return aRespuesta(actualizada);
  }

  /**
   * Archivar, nunca borrar (R-020-07, P-06).
   *
   * Una organización que deja de operar conserva su historia: quién estudió ahí, qué se cobró, qué
   * clases se dieron. Borrarla dejaría huérfano todo eso —y las llaves foráneas de T-202, con su
   * `RESTRICT`, ni siquiera lo permitirían.
   */
  async archivar(clubId: string, id: string): Promise<OrganizationResponse> {
    await this.exigirQueSeaDelClub(clubId, id);

    const archivada = await this.prisma.organization.update({
      where: { id },
      data: { status: "archived", archivedAt: this.clock.now() },
    });

    return aRespuesta(archivada);
  }

  /**
   * La consulta va **acotada por club**, no se trae la fila y se compara después: así el dato de
   * otro club ni siquiera se lee. Y si no aparece, `404` — nunca `403`, que confirmaría que existe
   * en algún lado (P-05, `docs/03` §3).
   */
  private async exigirQueSeaDelClub(clubId: string, id: string): Promise<void> {
    const existe = await this.prisma.organization.findFirst({
      where: { id, clubId },
      select: { id: true },
    });

    if (existe === null) {
      throw new NotFoundException();
    }
  }
}

function aRespuesta(fila: {
  id: string;
  name: string;
  type: string;
  status: "active" | "archived";
  archivedAt: Date | null;
}): OrganizationResponse {
  return {
    id: fila.id,
    name: fila.name,
    type: fila.type,
    status: fila.status,
    archivedAt: fila.archivedAt === null ? null : fila.archivedAt.toISOString(),
  };
}
