import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  AdjustGridRequest,
  NoShowRequest,
  type PracticeGridResponse,
} from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable, type ConAuditoria } from "../common/audit/auditable.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission, SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
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

  /**
   * Corregir la grilla (T-723).
   *
   * Manda **los cambios**, no la grilla entera — al revés que los equipos de `051`, y a propósito:
   * una grilla es una matriz de celdas independientes, así que dos correcciones simultáneas en
   * chukkers distintos no son un conflicto, son dos correcciones ciertas.
   */
  @Patch()
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.grid-adjusted", entityType: "chukker_grid_cell" })
  async ajustar(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdjustGridRequest)) cambios: AdjustGridRequest,
  ): Promise<PracticeGridResponse> {
    return this.grilla.ajustar(clubDeLaSolicitud(req), id, cambios);
  }

  /**
   * Marcar —o desmarcar— a quien no se presentó (T-724).
   *
   * Cuelga de `/grid` y no de la práctica porque lo que hace, además de marcar, es **vaciar sus
   * celdas**: sin esa parte la marca sería una anotación suelta que la grilla contradice.
   */
  @Post("no-show")
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.no-show", entityType: "practice_application" })
  async marcarAusente(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(NoShowRequest)) peticion: NoShowRequest,
  ): Promise<PracticeGridResponse> {
    return this.grilla.marcarAusente(clubDeLaSolicitud(req), id, peticion);
  }
}
