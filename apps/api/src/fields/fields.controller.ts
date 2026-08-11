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
  BlockFieldRequest,
  CreateFieldRequest,
  FieldBookingResponse,
  FieldResponse,
  UpdateFieldRequest,
} from "@polo/contracts";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable, anotarEstadoPrevio, type ConAuditoria } from "../common/audit/auditable.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission, SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { BookingsService } from "./bookings.service.js";
import { FieldsService } from "./fields.service.js";

type Solicitud = ConTenant & ConSessionUser & ConAuditoria;

/**
 * Las canchas del club (T-430, T-431).
 *
 * **Listar no exige permiso administrativo, sólo sesión**: cualquiera necesita saber qué canchas
 * hay para leer el calendario. Crear, editar y archivar sí exigen `field.edit`.
 */
@Controller("fields")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class FieldsController {
  constructor(private readonly servicio: FieldsService) {}

  @Get()
  @SinPermiso("Saber qué canchas hay es lo mínimo para leer el calendario.")
  async listar(
    @Req() req: Solicitud,
    @Query("incluirArchivadas") incluirArchivadas?: string,
  ): Promise<FieldResponse[]> {
    return this.servicio.listar(clubDeLaSolicitud(req), incluirArchivadas === "true");
  }

  @Post()
  @RequirePermission("field.edit")
  @Auditable({ action: "field.created", entityType: "field" })
  async crear(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(CreateFieldRequest)) cuerpo: CreateFieldRequest,
  ): Promise<FieldResponse> {
    return this.servicio.crear(clubDeLaSolicitud(req), cuerpo);
  }

  @Patch(":id")
  @RequirePermission("field.edit")
  @Auditable({ action: "field.updated", entityType: "field" })
  async actualizar(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateFieldRequest)) cuerpo: UpdateFieldRequest,
  ): Promise<FieldResponse> {
    const clubId = clubDeLaSolicitud(req);

    anotarEstadoPrevio(req, await this.servicio.detalle(clubId, id), id);

    return this.servicio.actualizar(clubId, id, cuerpo);
  }

  @Post(":id/archive")
  @RequirePermission("field.edit")
  @Auditable({ action: "field.archived", entityType: "field" })
  async archivar(@Req() req: Solicitud, @Param("id") id: string): Promise<FieldResponse> {
    const clubId = clubDeLaSolicitud(req);

    anotarEstadoPrevio(req, await this.servicio.detalle(clubId, id), id);

    return this.servicio.archivar(clubId, id);
  }
}

/**
 * Bloquear y liberar franjas (T-440, T-441).
 *
 * Va en su propio controlador y con su propio permiso: **el comisario bloquea pero no administra
 * canchas** (`docs/06` §4). Su autoridad es deportiva —la cancha está impracticable— no
 * administrativa.
 */
@Controller("field-bookings")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class FieldBookingsController {
  constructor(
    private readonly reservas: BookingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("block")
  @RequirePermission("field.block")
  @Auditable({ action: "field.blocked", entityType: "field_booking" })
  async bloquear(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(BlockFieldRequest)) cuerpo: BlockFieldRequest,
  ): Promise<FieldBookingResponse> {
    const clubId = clubDeLaSolicitud(req);

    // El bloqueo ocupa la cancha **igual que cualquier otra actividad**: pasa por el mismo servicio
    // y choca con lo que ya esté programado. No atropella nada — si hay que cancelar una práctica,
    // eso se decide y se hace explícitamente (HU-040-03).
    const creada = await this.prisma.$transaction((tx) =>
      this.reservas.reservar(
        tx,
        clubId,
        {
          fieldId: cuerpo.fieldId,
          startsAt: new Date(cuerpo.startsAt),
          endsAt: new Date(cuerpo.endsAt),
          type: "maintenance",
          reason: cuerpo.reason,
        },
        usuario(req).userAccountId,
      ),
    );

    const bloqueo = await this.prisma.fieldBooking.findUniqueOrThrow({
      where: { id: creada.id },
      select: { id: true, fieldId: true, startsAt: true, endsAt: true, type: true, reason: true },
    });

    return {
      ...bloqueo,
      startsAt: bloqueo.startsAt.toISOString(),
      endsAt: bloqueo.endsAt.toISOString(),
    };
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("field.block")
  @Auditable({ action: "field.unblocked", entityType: "field_booking" })
  async liberar(@Req() req: Solicitud, @Param("id") id: string): Promise<void> {
    const clubId = clubDeLaSolicitud(req);

    anotarEstadoPrevio(req, { id }, id);

    await this.reservas.cancelar(clubId, id);
  }
}

function usuario(req: ConSessionUser): { userAccountId: string } {
  const actual = req.sessionUser;

  if (actual === undefined) {
    throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud.");
  }

  return actual;
}
