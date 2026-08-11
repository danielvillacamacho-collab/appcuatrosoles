import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { ClubPublicResponse, ClubResponse, UpdateClubRequest } from "@polo/contracts";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { ClubDirectory } from "../tenant/club-directory.js";
import { esZonaHorariaValida } from "./timezone.js";

@Injectable()
export class ClubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directorio: ClubDirectory,
  ) {}

  /**
   * Lo que ve alguien que todavía no inició sesión (HU-020-09).
   *
   * Devuelve **exactamente dos campos**, construidos a mano y no con un `select` que alguien pueda
   * ampliar sin pensarlo: es la única respuesta del sistema que se sirve sin sesión, y todo campo
   * que se agregue aquí es información que cualquiera puede leer apuntando al subdominio.
   */
  async publico(clubId: string): Promise<ClubPublicResponse> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true, timezone: true },
    });

    if (club === null) {
      throw new NotFoundException();
    }

    return { name: club.name, timezone: club.timezone };
  }

  async detalle(clubId: string): Promise<ClubResponse> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });

    if (club === null) {
      throw new NotFoundException();
    }

    return {
      id: club.id,
      slug: club.slug,
      name: club.name,
      timezone: club.timezone,
      currency: club.currency,
      status: club.status,
    };
  }

  async actualizar(clubId: string, cambios: UpdateClubRequest): Promise<ClubResponse> {
    if (cambios.timezone !== undefined && !esZonaHorariaValida(cambios.timezone)) {
      throw new UnprocessableEntityException({ code: "timezone_desconocida" });
    }

    // Se arma el `data` campo por campo en vez de pasar el objeto entero: con
    // `exactOptionalPropertyTypes`, una clave presente con valor indefinido no es lo mismo que una
    // clave ausente, y además así ningún campo que el contrato no declare puede llegar al UPDATE.
    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        ...(cambios.name === undefined ? {} : { name: cambios.name }),
        ...(cambios.timezone === undefined ? {} : { timezone: cambios.timezone }),
      },
    });

    // El nombre viaja en la respuesta pública y el directorio guarda una copia del club: sin
    // invalidar, la pantalla de ingreso mostraría el nombre viejo hasta un minuto.
    this.directorio.invalidate();

    return this.detalle(clubId);
  }
}
