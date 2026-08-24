import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { AdjustTeamsRequest, type PracticeTeamsResponse } from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable, type ConAuditoria } from "../common/audit/auditable.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission, SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { TeamsService } from "./teams.service.js";

type Solicitud = ConTenant & ConSessionUser & ConAuditoria;

/**
 * Los equipos de una práctica (`specs/051` §8).
 *
 * **Ningún permiso nuevo**: `practice.manage` ya cubre proponer, ajustar y aprobar, porque los
 * equipos son parte de la práctica y los maneja quien la maneja. Que este módulo no haya necesitado
 * tocar la tabla de permisos es la señal de que ese permiso estaba bien pensado.
 */
@Controller("practices/:id/teams")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class TeamsController {
  constructor(
    private readonly equipos: TeamsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Ver los equipos.
   *
   * **Sin permiso declarado**: quién puede ver qué no lo decide un rol sino R-051-05, y lo aplica el
   * servicio — un jugador ve los aprobados, y de un borrador recibe 404.
   */
  @Get()
  @SinPermiso("Quién ve qué lo decide R-051-05 en el servicio, no un permiso.")
  async ver(@Req() req: Solicitud, @Param("id") id: string): Promise<PracticeTeamsResponse> {
    const clubId = clubDeLaSolicitud(req);

    return this.equipos.ver(clubId, id, { puedeAprobar: await this.puedeAprobar(req, clubId) });
  }

  @Post("propose")
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.teams-proposed", entityType: "practice_team" })
  async proponer(@Req() req: Solicitud, @Param("id") id: string): Promise<PracticeTeamsResponse> {
    return this.equipos.proponer(clubDeLaSolicitud(req), id);
  }

  @Patch()
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.teams-adjusted", entityType: "practice_team" })
  async ajustar(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdjustTeamsRequest)) cambios: AdjustTeamsRequest,
  ): Promise<PracticeTeamsResponse> {
    return this.equipos.ajustar(clubDeLaSolicitud(req), id, cambios);
  }

  @Post("approve")
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.teams-approved", entityType: "practice_team" })
  async aprobar(@Req() req: Solicitud, @Param("id") id: string): Promise<PracticeTeamsResponse> {
    const usuario = req.sessionUser;

    if (usuario === undefined) {
      throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
    }

    return this.equipos.aprobar(clubDeLaSolicitud(req), id, usuario.userAccountId);
  }

  /**
   * ¿Quien pregunta puede aprobar equipos?
   *
   * Se resuelve por rol y no por permiso porque la ruta de lectura **no declara permiso**: el guard
   * no evaluó nada, así que hay que preguntarlo acá para saber si además de leer, esta persona
   * puede ver un borrador.
   */
  private async puedeAprobar(req: Solicitud, clubId: string): Promise<boolean> {
    const usuario = req.sessionUser;

    if (usuario === undefined) {
      return false;
    }

    const roles = await this.prisma.roleAssignment.findMany({
      where: { userAccountId: usuario.userAccountId, revokedAt: null, scopeId: clubId },
      select: { role: true },
    });

    return roles.some((asignacion) =>
      ["club_admin", "commissioner", "superadmin"].includes(asignacion.role),
    );
  }
}
