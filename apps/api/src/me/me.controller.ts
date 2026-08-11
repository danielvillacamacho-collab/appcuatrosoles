import {
  Body,
  Controller,
  Delete,
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
  ConfirmEmailChangeRequest,
  DependentResponse,
  MeResponse,
  RequestEmailChangeRequest,
  NotificationPreferenceResponse,
  SessionResponse,
  UpdateMeRequest,
  UpdateNotificationPreferencesRequest,
} from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable, anotarEstadoPrevio, type ConAuditoria } from "../common/audit/auditable.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { UrlDelClub } from "../club/url-del-club.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { MeService } from "./me.service.js";

type Solicitud = ConTenant & ConSessionUser & ConAuditoria;

/**
 * El perfil propio (HU-010-07).
 *
 * **Ninguna ruta de aquí exige permiso, y todas exigen sesión**: cada quien manda sobre lo suyo.
 * Lo que sí acota es *qué* es lo suyo — el contrato de edición no declara nombre, categoría ni
 * roles, así que mandarlos no hace nada.
 */
@Controller("me")
@UseGuards(TenantGuard, SessionGuard)
@UseInterceptors(AuditInterceptor)
export class MeController {
  constructor(
    private readonly servicio: MeService,
    private readonly urlDelClub: UrlDelClub,
  ) {}

  @Get()
  async perfil(@Req() req: Solicitud): Promise<MeResponse> {
    return this.servicio.perfil(usuario(req).userAccountId, clubDeLaSolicitud(req));
  }

  @Patch()
  @SinPermiso("Editar el propio perfil no exige permiso: es el perfil de quien pide.")
  @Auditable({ action: "person.updated", entityType: "person" })
  async actualizar(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(UpdateMeRequest)) cambios: UpdateMeRequest,
  ): Promise<MeResponse> {
    const clubId = clubDeLaSolicitud(req);
    const antes = await this.servicio.perfil(usuario(req).userAccountId, clubId);

    // El interceptor no puede inferir la entidad: la respuesta de `/me` no trae `id` —trae
    // `personId` y `userAccountId`, que no son lo mismo— y la ruta no lleva parámetro. Se la anota
    // aquí, que es el hueco que T-023 dejó abierto para los casos que sólo el servicio conoce.
    anotarEstadoPrevio(req, antes, antes.personId);

    return this.servicio.actualizar(usuario(req).userAccountId, clubId, cambios);
  }

  @Post("email-change")
  @HttpCode(202)
  @SinPermiso("Cambiar el propio correo de acceso no exige permiso: es la cuenta de quien pide.")
  async pedirCambioDeCorreo(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(RequestEmailChangeRequest)) cuerpo: RequestEmailChangeRequest,
  ): Promise<{ mensaje: string }> {
    const clubId = clubDeLaSolicitud(req);

    await this.servicio.pedirCambioDeCorreo(
      usuario(req).userAccountId,
      clubId,
      cuerpo.newEmail,
      cuerpo.currentPassword,
      await this.urlDelClub.para(clubId),
    );

    return { mensaje: "Te enviamos un correo al nuevo buzón para confirmar el cambio." };
  }

  @Post("email-change/confirm")
  @HttpCode(204)
  @SinPermiso("Confirmar el propio correo no exige permiso: el enlace ES la prueba.")
  @Auditable({ action: "user.email_changed", entityType: "user_account" })
  async confirmarCambioDeCorreo(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(ConfirmEmailChangeRequest)) cuerpo: ConfirmEmailChangeRequest,
  ): Promise<void> {
    const actual = usuario(req);

    anotarEstadoPrevio(req, { userAccountId: actual.userAccountId }, actual.userAccountId);

    await this.servicio.confirmarCambioDeCorreo(cuerpo.token);
  }

  @Get("sessions")
  async sesiones(@Req() req: Solicitud): Promise<SessionResponse[]> {
    const actual = usuario(req);

    return this.servicio.sesiones(actual.userAccountId, actual.sessionId);
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  @SinPermiso("Cerrar una sesión propia no exige permiso: es la sesión de quien pide.")
  async cerrarSesion(@Req() req: Solicitud, @Param("id") id: string): Promise<void> {
    await this.servicio.cerrarSesion(usuario(req).userAccountId, id);
  }

  /**
   * Los perfiles a cargo de quien pregunta (`spec.md` §10, T-076).
   *
   * No exige permiso administrativo: **es la lista de sus propios hijos**. El acotamiento no lo
   * hace un rol, lo hace el vínculo — sólo devuelve los menores de quien pide, y sólo mientras el
   * vínculo esté vigente.
   */
  @Get("dependents")
  async dependientes(@Req() req: Solicitud): Promise<DependentResponse[]> {
    return this.servicio.dependientes(usuario(req).userAccountId, clubDeLaSolicitud(req));
  }

  @Get("notification-preferences")
  async preferencias(@Req() req: Solicitud): Promise<NotificationPreferenceResponse[]> {
    return this.servicio.preferencias(usuario(req).userAccountId);
  }

  @Patch("notification-preferences")
  @SinPermiso("Elegir qué avisos recibe uno no exige permiso: son los avisos de quien pide.")
  async actualizarPreferencias(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(UpdateNotificationPreferencesRequest))
    cuerpo: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferenceResponse[]> {
    return this.servicio.actualizarPreferencias(usuario(req).userAccountId, cuerpo.preferences);
  }

}

function usuario(req: ConSessionUser): { userAccountId: string; sessionId: string } {
  const actual = req.sessionUser;

  if (actual === undefined) {
    throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
  }

  return actual;
}
