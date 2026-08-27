import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApplyToPracticeRequest,
  CancelPracticeRequest,
  CreatePracticeRequest,
  UpdatePracticeRequest,
  type PracticeGridResponse,
  type PracticeResponse,
} from "@polo/contracts";
import { z } from "zod";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable, type ConAuditoria } from "../common/audit/auditable.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission, SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { ApplicationsService } from "./applications.service.js";
import { GridService } from "./grid.service.js";
import { PracticesService } from "./practices.service.js";

type Solicitud = ConTenant & ConSessionUser & ConAuditoria;

/** El rango que se pide del calendario. Como en `specs/040`: fechas, no instantes. */
const RangoDeFechas = z.object({
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
});

const AceptarPareja = z.object({ companeroPersonId: z.string().min(1) });
const RetirarseQuery = z.object({ enNombreDe: z.string().min(1).optional() });

/**
 * Prácticas oficiales (`specs/050`).
 *
 * **Ver no exige permiso administrativo, sólo sesión**: cualquiera del club necesita saber qué hay.
 * Lo que acota lo que ve no es un rol sino R-050-05, y lo aplica el servicio. Crear, publicar y
 * cancelar exigen `practice.manage`, que tienen el administrador **y** el comisario.
 */
@Controller("practices")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class PracticesController {
  constructor(
    private readonly practicas: PracticesService,
    private readonly postulaciones: ApplicationsService,
    private readonly grilla: GridService,
  ) {}

  @Get()
  @SinPermiso("Ver qué prácticas hay es de cualquiera del club; el recorte lo hace R-050-05.")
  async listar(
    @Req() req: Solicitud,
    @Query(new ZodValidationPipe(RangoDeFechas)) rango: z.infer<typeof RangoDeFechas>,
  ): Promise<PracticeResponse[]> {
    const desde = rango.desde === undefined ? new Date(0) : new Date(rango.desde);
    const hasta =
      rango.hasta === undefined ? new Date("2100-01-01T00:00:00Z") : new Date(rango.hasta);

    return this.practicas.listar(clubDeLaSolicitud(req), quienMira(req), { desde, hasta });
  }

  @Get(":id")
  @SinPermiso("Mismo criterio que el listado.")
  async detalle(@Req() req: Solicitud, @Param("id") id: string): Promise<PracticeResponse> {
    return this.practicas.detalle(clubDeLaSolicitud(req), id, quienMira(req));
  }

  @Post()
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.created", entityType: "practice" })
  async crear(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(CreatePracticeRequest)) datos: CreatePracticeRequest,
  ): Promise<PracticeResponse> {
    return this.practicas.crear(clubDeLaSolicitud(req), datos, cuentaDe(req));
  }

  @Patch(":id")
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.updated", entityType: "practice" })
  async actualizar(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdatePracticeRequest)) cambios: UpdatePracticeRequest,
  ): Promise<PracticeResponse> {
    return this.practicas.actualizar(clubDeLaSolicitud(req), id, cambios);
  }

  @Post(":id/publish")
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.published", entityType: "practice" })
  async publicar(@Req() req: Solicitud, @Param("id") id: string): Promise<PracticeResponse> {
    return this.practicas.publicar(clubDeLaSolicitud(req), id, cuentaDe(req));
  }

  @Post(":id/cancel")
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.cancelled", entityType: "practice" })
  async cancelar(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CancelPracticeRequest)) datos: CancelPracticeRequest,
  ): Promise<PracticeResponse> {
    return this.practicas.cancelar(clubDeLaSolicitud(req), id, datos.reason);
  }

  /**
   * Cerrar la práctica: lo registrado queda firme (T-725, HU-052-03).
   *
   * Va acá y no bajo `/grid` porque lo que cambia es **el estado de la práctica**, igual que
   * publicar y cancelar. Lo que se congela es la grilla, pero lo que se decide es la práctica.
   */
  @Post(":id/close")
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.closed", entityType: "practice" })
  async cerrar(@Req() req: Solicitud, @Param("id") id: string): Promise<PracticeGridResponse> {
    return this.grilla.cerrar(clubDeLaSolicitud(req), id, cuentaDe(req));
  }

  /**
   * Reabrir (R-052-06).
   *
   * **Queda auditado**, que es la mitad de la razón por la que reabrir puede existir: si el rastro
   * se perdiera, cerrar dejaría de significar algo.
   */
  @Post(":id/reopen")
  @RequirePermission("practice.manage")
  @Auditable({ action: "practice.reopened", entityType: "practice" })
  async reabrir(@Req() req: Solicitud, @Param("id") id: string): Promise<PracticeGridResponse> {
    return this.grilla.reabrir(clubDeLaSolicitud(req), id, cuentaDe(req));
  }

  @Post(":id/applications")
  @HttpCode(204)
  @SinPermiso("Postularse es de cualquiera que pueda ver la práctica (R-050-05).")
  @Auditable({ action: "practice.applied", entityType: "practice_application" })
  async postularse(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ApplyToPracticeRequest)) datos: ApplyToPracticeRequest,
  ): Promise<void> {
    await this.postulaciones.postularse(clubDeLaSolicitud(req), id, datos, exigirQuien(req));
  }

  @Delete(":id/applications/mine")
  @HttpCode(204)
  @SinPermiso("Retirarse es de quien se postuló.")
  @Auditable({ action: "practice.withdrawn", entityType: "practice_application" })
  async retirarse(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(RetirarseQuery)) consulta: z.infer<typeof RetirarseQuery>,
  ): Promise<void> {
    await this.postulaciones.retirarse(
      clubDeLaSolicitud(req),
      id,
      exigirQuien(req),
      consulta.enNombreDe,
    );
  }

  @Post(":id/applications/mine/accept-partner")
  @HttpCode(204)
  @SinPermiso("Aceptar compartir puesto es de quien recibió la propuesta.")
  @Auditable({ action: "practice.partner-accepted", entityType: "practice_application" })
  async aceptarPareja(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AceptarPareja)) datos: z.infer<typeof AceptarPareja>,
  ): Promise<void> {
    await this.postulaciones.aceptarPareja(
      clubDeLaSolicitud(req),
      id,
      exigirQuien(req),
      datos.companeroPersonId,
    );
  }
}

function quienMira(req: Solicitud): { personId: string } | null {
  const usuario = req.sessionUser;

  return usuario === undefined ? null : { personId: usuario.personId };
}

function exigirQuien(req: Solicitud): { personId: string } {
  const usuario = req.sessionUser;

  if (usuario === undefined) {
    throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
  }

  return { personId: usuario.personId };
}

function cuentaDe(req: Solicitud): string {
  const usuario = req.sessionUser;

  if (usuario === undefined) {
    throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
  }

  return usuario.userAccountId;
}
