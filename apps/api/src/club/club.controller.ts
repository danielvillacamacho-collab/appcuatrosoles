import { Body, Controller, Get, Patch, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { ClubPublicResponse, ClubResponse, UpdateClubRequest } from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable } from "../common/audit/auditable.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { ClubService } from "./club.service.js";
import { clubDeLaSolicitud } from "./tenant-de-la-solicitud.js";

/**
 * El club de la solicitud. Todas las rutas pasan por `TenantGuard`, así que operan **sobre el club
 * del subdominio**: ninguna recibe un identificador de club, porque un `clubId` del cliente nunca
 * determina el tenant (R-020-01).
 */
@Controller("clubs/current")
@UseGuards(TenantGuard)
@UseInterceptors(AuditInterceptor)
export class ClubController {
  constructor(private readonly servicio: ClubService) {}

  /**
   * **La única ruta del sistema que se sirve sin sesión.** Es lo que necesita la pantalla de
   * ingreso para que alguien sepa que está en el club correcto antes de escribir su contraseña.
   */
  @Get("public")
  async publico(@Req() req: ConTenant): Promise<ClubPublicResponse> {
    return this.servicio.publico(clubDeLaSolicitud(req));
  }

  @Get()
  @UseGuards(SessionGuard)
  async detalle(@Req() req: ConTenant): Promise<ClubResponse> {
    return this.servicio.detalle(clubDeLaSolicitud(req));
  }

  @Patch()
  @UseGuards(SessionGuard, PermissionGuard)
  @RequirePermission("club.edit")
  @Auditable({ action: "club.updated", entityType: "club" })
  async actualizar(
    @Req() req: ConTenant,
    @Body(new ZodValidationPipe(UpdateClubRequest)) cambios: UpdateClubRequest,
  ): Promise<ClubResponse> {
    return this.servicio.actualizar(clubDeLaSolicitud(req), cambios);
  }
}
