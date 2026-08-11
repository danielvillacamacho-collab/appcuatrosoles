import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import {
  CreateMembershipCategoryRequest,
  MembershipCategoryResponse,
  UpdateMembershipCategoryRequest,
} from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable } from "../common/audit/auditable.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { MembershipCategoryService } from "./membership-category.service.js";
import { clubDeLaSolicitud } from "./tenant-de-la-solicitud.js";

/**
 * Categorías de membresía (HU-020-07). Son un **catálogo administrable**, no un enum del código:
 * el club crea las suyas, les cambia la cuota y desactiva las que no usa, sin desplegar nada (P-04).
 */
@Controller("membership-categories")
@UseGuards(TenantGuard, SessionGuard)
@UseInterceptors(AuditInterceptor)
export class MembershipCategoryController {
  constructor(private readonly servicio: MembershipCategoryService) {}

  @Get()
  async listar(@Req() req: ConTenant): Promise<MembershipCategoryResponse[]> {
    return this.servicio.listar(clubDeLaSolicitud(req));
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("membership.manage")
  @Auditable({ action: "membership_category.created", entityType: "membership_category" })
  async crear(
    @Req() req: ConTenant,
    @Body(new ZodValidationPipe(CreateMembershipCategoryRequest))
    cuerpo: CreateMembershipCategoryRequest,
  ): Promise<MembershipCategoryResponse> {
    return this.servicio.crear(clubDeLaSolicitud(req), cuerpo);
  }

  @Patch(":id")
  @UseGuards(PermissionGuard)
  @RequirePermission("membership.manage")
  @Auditable({ action: "membership_category.updated", entityType: "membership_category" })
  async actualizar(
    @Req() req: ConTenant,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateMembershipCategoryRequest))
    cuerpo: UpdateMembershipCategoryRequest,
  ): Promise<MembershipCategoryResponse> {
    return this.servicio.actualizar(clubDeLaSolicitud(req), id, cuerpo);
  }
}
