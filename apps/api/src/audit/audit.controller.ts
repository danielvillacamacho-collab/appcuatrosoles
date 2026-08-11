import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { AuditEntryResponse } from "@polo/contracts";
import type { RoleAssignmentRef } from "@polo/domain";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { AuditService } from "./audit.service.js";

type Solicitud = ConTenant & ConSessionUser;

@Controller("audit-log")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
export class AuditController {
  constructor(
    private readonly servicio: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * `GET /audit-log` (T-080).
   *
   * Ámbito amplio: un administrador de organización tiene `audit.view` en la suya, y **qué filas
   * son suyas lo decide el servicio**. El guard sólo comprueba que tenga autoridad en algún lado
   * del club.
   *
   * **No hay ruta para escribir ni para borrar.** `audit_log` es append-only por triggers (P-07,
   * T-004) y sólo la escribe el interceptor (T-023): una ruta de escritura sería la forma de
   * convertir el registro en algo que alguien puede maquillar.
   */
  @Get()
  @RequirePermission("audit.view", { ambitoAmplio: true })
  async listar(
    @Req() req: Solicitud,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("actorUserId") actorUserId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ): Promise<AuditEntryResponse[]> {
    const usuario = req.sessionUser;

    if (usuario === undefined) {
      throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
    }

    const roles = await this.prisma.roleAssignment.findMany({
      where: { userAccountId: usuario.userAccountId, revokedAt: null },
      select: { role: true, scope: true, scopeId: true },
    });

    return this.servicio.listar(
      clubDeLaSolicitud(req),
      { userAccountId: usuario.userAccountId, roles: roles as RoleAssignmentRef[] },
      {
        ...(action === undefined ? {} : { action }),
        ...(entityType === undefined ? {} : { entityType }),
        ...(entityId === undefined ? {} : { entityId }),
        ...(actorUserId === undefined ? {} : { actorUserId }),
        ...(desde === undefined ? {} : { desde: new Date(desde) }),
        ...(hasta === undefined ? {} : { hasta: new Date(hasta) }),
      },
    );
  }
}
