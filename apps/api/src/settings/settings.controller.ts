import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { SetSettingRequest, SettingHistoryEntry, SettingResponse } from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable, anotarEstadoPrevio, type ConAuditoria } from "../common/audit/auditable.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { SettingsService, type AmbitoDeConsulta } from "./settings.service.js";

type Solicitud = ConTenant & ConSessionUser & ConAuditoria;

/**
 * Configuración, con **una familia de rutas por ámbito** (`/platform/settings`, `/settings`,
 * `/organizations/:id/settings`).
 *
 * No es repetición: el ámbito no puede llegar como parámetro. `PermissionGuard` decide *antes* de
 * entrar al controlador, y para eso el ámbito tiene que estar declarado en la ruta — con un
 * `?scope=platform` en la query, el cliente elegiría contra qué se evalúa su propio permiso.
 */
@Controller()
@UseGuards(TenantGuard, SessionGuard)
@UseInterceptors(AuditInterceptor)
export class SettingsController {
  constructor(private readonly servicio: SettingsService) {}

  // ── Ámbito de club ──────────────────────────────────────────────────────────

  @Get("settings")
  async listarDelClub(@Req() req: Solicitud, @Query("asOf") asOf?: string): Promise<SettingResponse[]> {
    return this.servicio.listar(this.ambitoDeClub(req), leerInstante(asOf));
  }

  @Get("settings/:key/history")
  async historialDelClub(
    @Req() req: Solicitud,
    @Param("key") key: string,
  ): Promise<SettingHistoryEntry[]> {
    return this.servicio.historial(this.ambitoDeClub(req), key);
  }

  @Get("settings/:key")
  async leerDelClub(
    @Req() req: Solicitud,
    @Param("key") key: string,
    @Query("asOf") asOf?: string,
  ): Promise<SettingResponse> {
    return this.servicio.leer(this.ambitoDeClub(req), key, leerInstante(asOf));
  }

  @Put("settings/:key")
  @UseGuards(PermissionGuard)
  @RequirePermission("setting.edit")
  @Auditable({ action: "setting.changed", entityType: "setting" })
  async fijarEnElClub(
    @Req() req: Solicitud,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(SetSettingRequest)) cuerpo: SetSettingRequest,
  ): Promise<SettingResponse> {
    return this.fijar(req, this.ambitoDeClub(req), key, cuerpo);
  }

  // ── Ámbito de plataforma ────────────────────────────────────────────────────

  @Get("platform/settings")
  async listarDeLaPlataforma(): Promise<SettingResponse[]> {
    return this.servicio.listar(AMBITO_DE_PLATAFORMA);
  }

  @Put("platform/settings/:key")
  @UseGuards(PermissionGuard)
  @RequirePermission("setting.edit", { plataforma: true })
  @Auditable({ action: "setting.changed", entityType: "setting" })
  async fijarEnLaPlataforma(
    @Req() req: Solicitud,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(SetSettingRequest)) cuerpo: SetSettingRequest,
  ): Promise<SettingResponse> {
    return this.fijar(req, AMBITO_DE_PLATAFORMA, key, cuerpo);
  }

  // ── Ámbito de organización ──────────────────────────────────────────────────

  @Get("organizations/:id/settings")
  async listarDeLaOrganizacion(
    @Req() req: Solicitud,
    @Param("id") id: string,
  ): Promise<SettingResponse[]> {
    return this.servicio.listar(this.ambitoDeOrganizacion(req, id));
  }

  @Put("organizations/:id/settings/:key")
  @UseGuards(PermissionGuard)
  @RequirePermission("setting.edit", { organizacion: { desde: "params", campo: "id" } })
  @Auditable({ action: "setting.changed", entityType: "setting" })
  async fijarEnLaOrganizacion(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(SetSettingRequest)) cuerpo: SetSettingRequest,
  ): Promise<SettingResponse> {
    return this.fijar(req, this.ambitoDeOrganizacion(req, id), key, cuerpo);
  }

  /**
   * Fija el valor y le deja al interceptor de auditoría el estado previo y la entidad tocada.
   *
   * El `entityId` es la clave y no un identificador de fila: una fila de `setting` es un cambio,
   * no una cosa. Lo que alguien va a buscar meses después es «qué pasó con esta clave», no «qué
   * pasó con esta fila».
   */
  private async fijar(
    req: Solicitud,
    ambito: AmbitoDeConsulta,
    key: string,
    cuerpo: SetSettingRequest,
  ): Promise<SettingResponse> {
    const antes = await this.servicio.leer(ambito, key).catch(() => undefined);

    anotarEstadoPrevio(req, antes, key);

    return this.servicio.fijar(ambito, key, cuerpo.value, {
      ...(cuerpo.effectiveFrom === undefined
        ? {}
        : { effectiveFrom: new Date(cuerpo.effectiveFrom) }),
      ...(req.sessionUser === undefined ? {} : { actorUserId: req.sessionUser.userAccountId }),
    });
  }

  private ambitoDeClub(req: Solicitud): AmbitoDeConsulta {
    return { scope: "club", clubId: clubDeLaSolicitud(req), organizationId: null };
  }

  private ambitoDeOrganizacion(req: Solicitud, organizationId: string): AmbitoDeConsulta {
    return { scope: "organization", clubId: clubDeLaSolicitud(req), organizationId };
  }
}

const AMBITO_DE_PLATAFORMA: AmbitoDeConsulta = {
  scope: "platform",
  clubId: null,
  organizationId: null,
};

function leerInstante(valor: string | undefined): Date | undefined {
  if (valor === undefined) return undefined;

  const instante = new Date(valor);

  return Number.isNaN(instante.getTime()) ? undefined : instante;
}
