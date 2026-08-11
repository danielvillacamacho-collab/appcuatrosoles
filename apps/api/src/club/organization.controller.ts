import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  CreateOrganizationRequest,
  OrganizationResponse,
  UpdateOrganizationRequest,
} from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable } from "../common/audit/auditable.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { OrganizationService } from "./organization.service.js";
import { clubDeLaSolicitud } from "./tenant-de-la-solicitud.js";

/**
 * Las organizaciones del club (HU-020-05).
 *
 * **Crear es de ámbito de club; editar y archivar, de la organización concreta.** No es un detalle:
 * así un `organization_admin` administra la suya —y sólo la suya— pero no puede crear otras, que
 * sería una forma indirecta de ampliarse el terreno.
 */
@Controller("organizations")
@UseGuards(TenantGuard, SessionGuard)
@UseInterceptors(AuditInterceptor)
export class OrganizationController {
  constructor(private readonly servicio: OrganizationService) {}

  @Get()
  async listar(@Req() req: ConTenant): Promise<OrganizationResponse[]> {
    return this.servicio.listar(clubDeLaSolicitud(req));
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("organization.manage")
  @Auditable({ action: "organization.created", entityType: "organization" })
  async crear(
    @Req() req: ConTenant,
    @Body(new ZodValidationPipe(CreateOrganizationRequest)) cuerpo: CreateOrganizationRequest,
  ): Promise<OrganizationResponse> {
    return this.servicio.crear(clubDeLaSolicitud(req), cuerpo);
  }

  @Patch(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("organization.manage", { organizacion: { desde: "params", campo: "id" } })
  @Auditable({ action: "organization.updated", entityType: "organization" })
  async actualizar(
    @Req() req: ConTenant,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateOrganizationRequest)) cuerpo: UpdateOrganizationRequest,
  ): Promise<OrganizationResponse> {
    return this.servicio.actualizar(clubDeLaSolicitud(req), id, cuerpo);
  }

  @Post(":id/archive")
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission("organization.manage", { organizacion: { desde: "params", campo: "id" } })
  @Auditable({ action: "organization.archived", entityType: "organization" })
  async archivar(@Req() req: ConTenant, @Param("id") id: string): Promise<OrganizationResponse> {
    return this.servicio.archivar(clubDeLaSolicitud(req), id);
  }
}
