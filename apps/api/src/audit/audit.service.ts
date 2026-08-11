import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuditEntryResponse } from "@polo/contracts";
import type { RoleAssignmentRef } from "@polo/domain";
import { PrismaService } from "../common/prisma/prisma.service.js";

export interface FiltrosDeAuditoria {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  desde?: Date;
  hasta?: Date;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El registro de auditoría del club (T-080, R-010-11).
   *
   * **Un administrador de organización sólo ve lo suyo.** La fila de `audit_log` no guarda a qué
   * organización pertenece —no podría: audita cualquier entidad del sistema— así que el recorte se
   * hace por **la gente**: se ve lo que hicieron los suyos y lo que se hizo sobre los suyos. Es la
   * lectura honesta de «su ámbito» con los datos que existen, y está anotada porque el día que
   * haya entidades de organización que no sean personas habrá que ampliarla.
   */
  async listar(
    clubId: string,
    actor: { userAccountId: string; roles: RoleAssignmentRef[] },
    filtros: FiltrosDeAuditoria,
    limite = 100,
  ): Promise<AuditEntryResponse[]> {
    const recorte = await this.recortePorOrganizacion(clubId, actor);

    const filas = await this.prisma.auditLog.findMany({
      where: {
        clubId,
        ...(filtros.action === undefined ? {} : { action: filtros.action }),
        ...(filtros.entityType === undefined ? {} : { entityType: filtros.entityType }),
        ...(filtros.entityId === undefined ? {} : { entityId: filtros.entityId }),
        ...(filtros.actorUserId === undefined ? {} : { actorUserId: filtros.actorUserId }),
        ...(filtros.desde === undefined && filtros.hasta === undefined
          ? {}
          : {
              occurredAt: {
                ...(filtros.desde === undefined ? {} : { gte: filtros.desde }),
                ...(filtros.hasta === undefined ? {} : { lte: filtros.hasta }),
              },
            }),
        ...recorte,
      },
      orderBy: { occurredAt: "desc" },
      take: Math.min(limite, 200),
    });

    return filas.map((fila) => ({
      id: fila.id,
      action: fila.action,
      entityType: fila.entityType,
      entityId: fila.entityId,
      actorUserId: fila.actorUserId,
      occurredAt: fila.occurredAt.toISOString(),
      requestId: fila.requestId,
      before: fila.before,
      after: fila.after,
    }));
  }

  private async recortePorOrganizacion(
    clubId: string,
    actor: { roles: RoleAssignmentRef[] },
  ): Promise<Prisma.AuditLogWhereInput> {
    const mandaEnElClub = actor.roles.some(
      (rol) =>
        rol.scope === "platform" ||
        (rol.scope === "club" && (rol.role === "club_admin" || rol.role === "superadmin")),
    );

    if (mandaEnElClub) {
      return {};
    }

    const suyas = actor.roles
      .filter((rol) => rol.scope === "organization" && rol.scopeId !== null)
      .map((rol) => rol.scopeId ?? "");

    const cuentas = await this.prisma.userAccount.findMany({
      where: { person: { clubId, organizations: { some: { leftOn: null, organizationId: { in: suyas } } } } },
      select: { id: true, personId: true },
    });

    const identificadores = [
      ...cuentas.map((cuenta) => cuenta.id),
      ...cuentas.map((cuenta) => cuenta.personId),
    ];

    return {
      OR: [
        { actorUserId: { in: cuentas.map((cuenta) => cuenta.id) } },
        { entityId: { in: identificadores } },
      ],
    };
  }
}
