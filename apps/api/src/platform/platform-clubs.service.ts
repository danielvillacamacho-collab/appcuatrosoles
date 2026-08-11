import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Clock } from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import type { ClubResponse, CreateClubRequest } from "@polo/contracts";
import { validateSlug } from "@polo/domain";
import { crearClubCompleto, SIN_CONTRASENA } from "../club/create-club.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { ClubDirectory } from "../tenant/club-directory.js";

/**
 * Alta de clubes (HU-020-02). Es la operación que decide si el negocio funciona: aprovisionar un
 * cliente tiene que costar horas, no días (`specs/140` §1).
 */
@Injectable()
export class PlatformClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directorio: ClubDirectory,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async crear(datos: CreateClubRequest): Promise<ClubResponse> {
    const slug = validateSlug(datos.slug);

    if (!slug.ok) {
      // 422 y no 400: el cuerpo cumple su esquema (es texto, de largo válido); lo que no cumple es
      // una regla de negocio (`docs/03` §3). El código dice cuál, para que la pantalla lo explique.
      throw new UnprocessableEntityException({ code: slug.error });
    }

    if (!esZonaHorariaValida(datos.timezone)) {
      throw new UnprocessableEntityException({ code: "timezone_desconocida" });
    }

    const yaExiste = await this.prisma.club.findUnique({ where: { slug: slug.value } });

    if (yaExiste !== null) {
      throw new ConflictException({ code: "slug_en_uso" });
    }

    // Todo en una transacción: un club a medio crear —con su fila pero sin categorías, o con
    // categorías y sin administrador— es peor que ningún club, porque parece que existe.
    const club = await this.prisma.$transaction(async (tx) =>
      crearClubCompleto(tx, {
        slug: slug.value,
        name: datos.name,
        timezone: datos.timezone,
        currency: datos.currency,
        adminEmail: datos.adminEmail,
        adminFullName: datos.adminFullName,
        // Sin contraseña utilizable: la define la persona al aceptar la invitación.
        adminPasswordHash: SIN_CONTRASENA,
        adminStatus: "invited",
      }),
    );

    // La caché no sabe de este club todavía, y sin esto el subdominio nuevo respondería 404
    // durante hasta un minuto — justo mientras quien lo creó lo está probando.
    this.directorio.invalidate();

    return aRespuesta(club);
  }

  /**
   * Suspender corta el acceso **de inmediato** (R-020-04, HU-020-04).
   *
   * «De inmediato» son tres cosas, y las tres pasan aquí: se marca el club, **se revocan todas las
   * sesiones activas de su gente** y se invalida la caché de tenants. Sin la segunda, quien ya
   * estaba adentro seguiría trabajando hasta que su sesión venciera por su cuenta; sin la tercera,
   * el subdominio seguiría resolviendo hasta un minuto más.
   *
   * No se borra nada: los datos quedan intactos y el club se puede reactivar tal cual estaba.
   */
  async suspender(id: string, motivo: string): Promise<ClubResponse> {
    const ahora = this.clock.now();

    const club = await this.prisma.$transaction(async (tx) => {
      const existente = await tx.club.findUnique({ where: { id } });

      if (existente === null) {
        throw new NotFoundException();
      }

      const actualizado = await tx.club.update({
        where: { id },
        data: { status: "suspended", suspendedAt: ahora, suspendedReason: motivo },
      });

      await tx.session.updateMany({
        where: { userAccount: { person: { clubId: id } }, revokedAt: null },
        data: { revokedAt: ahora },
      });

      return actualizado;
    });

    this.directorio.invalidate();

    return aRespuesta(club);
  }

  /**
   * Reactivar devuelve el club tal como estaba. **No borra `suspendedAt` ni el motivo**: la
   * historia de un corte de servicio es justo lo que hace falta cuando hay una discusión
   * contractual meses después, y el estado ya dice que hoy está activo.
   *
   * Las sesiones revocadas no vuelven: quien estaba adentro entra de nuevo con su contraseña. Es
   * lo correcto — una sesión revocada durante una suspensión no debería revivir sola.
   */
  async reactivar(id: string): Promise<ClubResponse> {
    const existente = await this.prisma.club.findUnique({ where: { id } });

    if (existente === null) {
      throw new NotFoundException();
    }

    const club = await this.prisma.club.update({ where: { id }, data: { status: "active" } });

    this.directorio.invalidate();

    return aRespuesta(club);
  }
}

function aRespuesta(club: {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  status: "active" | "suspended";
}): ClubResponse {
  return {
    id: club.id,
    slug: club.slug,
    name: club.name,
    timezone: club.timezone,
    currency: club.currency,
    status: club.status,
  };
}

/**
 * Se valida contra `Intl` y no contra una lista propia: la base de datos de zonas horarias cambia
 * —países que cambian de huso, zonas que se agregan— y una lista escrita a mano envejece sin que
 * nadie se entere hasta que un club de un país nuevo no puede darse de alta.
 */
function esZonaHorariaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });

    return true;
  } catch {
    return false;
  }
}
