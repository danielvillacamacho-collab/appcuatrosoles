import { Body, Controller, HttpCode, Param, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { ClubResponse, CreateClubRequest, SuspendClubRequest } from "@polo/contracts";
import { Auditable } from "../common/audit/auditable.js";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission } from "../common/auth/require-permission.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { PlatformClubsService } from "./platform-clubs.service.js";

/**
 * Administración de la plataforma: dar de alta clubes, suspenderlos y reactivarlos.
 *
 * **No lleva `TenantGuard`**, y es la única familia de rutas que puede permitírselo: opera *sobre*
 * los clubes, no *dentro* de uno. `PermissionGuard` exige `platform.club.manage`, que sólo tiene
 * `superadmin` (T-222), así que el ámbito sigue cerrado — pero por permiso, no por subdominio.
 *
 * `specs/140` §8 aclara que en producción esto se sirve desde el dominio de administración y no
 * desde el subdominio de un cliente: **dos condiciones, no una**. La segunda es de despliegue y
 * queda anotada como pendiente.
 */
@Controller("platform/clubs")
@UseGuards(SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class PlatformClubsController {
  constructor(private readonly servicio: PlatformClubsService) {}

  @Post()
  @RequirePermission("platform.club.manage", { plataforma: true })
  @Auditable({ action: "club.created", entityType: "club" })
  async crear(
    @Body(new ZodValidationPipe(CreateClubRequest)) cuerpo: CreateClubRequest,
  ): Promise<ClubResponse> {
    return this.servicio.crear(cuerpo);
  }

  @Post(":id/suspend")
  @HttpCode(200)
  @RequirePermission("platform.club.manage", { plataforma: true })
  @Auditable({ action: "club.suspended", entityType: "club" })
  async suspender(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SuspendClubRequest)) cuerpo: SuspendClubRequest,
  ): Promise<ClubResponse> {
    return this.servicio.suspender(id, cuerpo.reason);
  }

  @Post(":id/reactivate")
  @HttpCode(200)
  @RequirePermission("platform.club.manage", { plataforma: true })
  @Auditable({ action: "club.reactivated", entityType: "club" })
  async reactivar(@Param("id") id: string): Promise<ClubResponse> {
    return this.servicio.reactivar(id);
  }
}
