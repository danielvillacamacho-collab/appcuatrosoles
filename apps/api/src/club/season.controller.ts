import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import { CreateSeasonRequest, SeasonResponse } from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable } from "../common/audit/auditable.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { SeasonService } from "./season.service.js";
import { clubDeLaSolicitud } from "./tenant-de-la-solicitud.js";

/** Temporadas del club (HU-020-06). De ámbito de club: una organización no define el calendario. */
@Controller("seasons")
@UseGuards(TenantGuard, SessionGuard)
@UseInterceptors(AuditInterceptor)
export class SeasonController {
  constructor(private readonly servicio: SeasonService) {}

  @Get()
  async listar(@Req() req: ConTenant): Promise<SeasonResponse[]> {
    return this.servicio.listar(clubDeLaSolicitud(req));
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("season.manage")
  @Auditable({ action: "season.created", entityType: "season" })
  async crear(
    @Req() req: ConTenant,
    @Body(new ZodValidationPipe(CreateSeasonRequest)) cuerpo: CreateSeasonRequest,
  ): Promise<SeasonResponse> {
    return this.servicio.crear(clubDeLaSolicitud(req), cuerpo);
  }

  @Post(":id/close")
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission("season.manage")
  @Auditable({ action: "season.closed", entityType: "season" })
  async cerrar(@Req() req: ConTenant, @Param("id") id: string): Promise<SeasonResponse> {
    return this.servicio.cerrar(clubDeLaSolicitud(req), id);
  }
}
