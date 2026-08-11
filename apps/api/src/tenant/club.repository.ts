import { Injectable } from "@nestjs/common";
import type { ClubRef } from "@polo/domain";
import { PrismaService } from "../common/prisma/prisma.service.js";

/**
 * El acceso a la tabla `club`.
 *
 * **Es el único repositorio del sistema que consulta sin filtro de tenant, y por definición tiene
 * que serlo**: es el que resuelve cuál es el tenant. Cualquier otro repositorio que no filtre por
 * `club_id` es un bug (P-05); éste es la excepción que hace posible la regla, y por eso vive
 * aparte, con su propio nombre, en vez de esconderse dentro de un servicio genérico.
 *
 * Devuelve el vocabulario del dominio (`ClubRef`) y no la fila de Prisma: quien resuelve el tenant
 * no necesita saber cuándo se creó el club ni por qué se lo suspendió, y todo campo que se filtre
 * de más termina apareciendo en un log o en una respuesta.
 */
@Injectable()
export class ClubRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Todos los clubes, activos y suspendidos.
   *
   * Los suspendidos también se traen: `resolveTenant` necesita distinguirlos para el log —aunque
   * la respuesta al cliente sea idéntica— y omitirlos aquí obligaría a una segunda consulta para
   * saber si un host desconocido es un club que dejó de pagar o un intento a ciegas.
   */
  async findAll(): Promise<ClubRef[]> {
    const filas = await this.prisma.club.findMany({
      select: { id: true, slug: true, status: true },
      orderBy: { slug: "asc" },
    });

    return filas.map((fila) => ({ id: fila.id, slug: fila.slug, status: fila.status }));
  }
}
