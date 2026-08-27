import { Controller, Get, Param, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import type { PracticeGridResponse } from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import type { ConAuditoria } from "../common/audit/auditable.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { GridService } from "./grid.service.js";

type Solicitud = ConTenant & ConSessionUser & ConAuditoria;

/**
 * La grilla de chukkers de una práctica (`specs/052` §8).
 *
 * **Ningún permiso nuevo**: `practice.manage` cubre llenar, corregir, cerrar y reabrir, porque la
 * grilla es parte de la práctica y la maneja quien la maneja.
 */
@Controller("practices/:id/grid")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class GridController {
  constructor(private readonly grilla: GridService) {}

  /**
   * Ver la grilla.
   *
   * **Sin permiso**: la ve cualquiera con sesión en el club (plan §4). Los equipos ya son públicos
   * desde que se aprobaron, así que no hay nada que esconder, y esconderla dejaría al jugador
   * preguntando por WhatsApp cuántos chukkers jugó.
   */
  @Get()
  @SinPermiso("La grilla de una práctica la ve cualquiera del club (plan §4 de `specs/052`).")
  async ver(@Req() req: Solicitud, @Param("id") id: string): Promise<PracticeGridResponse> {
    return this.grilla.ver(clubDeLaSolicitud(req), id);
  }
}
