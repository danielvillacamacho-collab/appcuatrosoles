import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  AcceptWaiverRequest,
  CreateGuardianshipRequest,
  CreateMinorRequest,
  DependentResponse,
  GuardianshipResponse,
  PublishWaiverRequest,
  WaiverResponse,
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
import { GuardianshipsService } from "./guardianships.service.js";
import { WaiversService } from "./waivers.service.js";

type Solicitud = ConTenant & ConSessionUser & ConAuditoria;

@Controller("guardianships")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class GuardianshipsController {
  constructor(private readonly servicio: GuardianshipsService) {}

  @Post()
  @RequirePermission("user.edit")
  @Auditable({ action: "guardianship.created", entityType: "guardianship" })
  async crear(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(CreateGuardianshipRequest)) cuerpo: CreateGuardianshipRequest,
  ): Promise<GuardianshipResponse> {
    return this.servicio.crear(clubDeLaSolicitud(req), cuerpo);
  }

  @Get(":dependentPersonId")
  @RequirePermission("user.edit")
  async listar(
    @Req() req: Solicitud,
    @Param("dependentPersonId") dependentPersonId: string,
  ): Promise<GuardianshipResponse[]> {
    return this.servicio.listarDeDependiente(clubDeLaSolicitud(req), dependentPersonId);
  }
}


/**
 * El perfil de un menor **sin cuenta propia** (T-076, HU-010-10).
 *
 * Controlador aparte y no una ruta de `/guardianships`: lo que se crea aquí es **una persona** —el
 * vínculo con su acudiente viene incluido porque no puede faltar, no porque sea el recurso.
 */
@Controller("minors")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class MinorsController {
  constructor(private readonly servicio: GuardianshipsService) {}

  /**
   * Crear el perfil de un menor sin cuenta (T-076).
   *
   * Exige `user.create` y no `user.edit`: **está creando una persona en el club**, aunque no le
   * cree una cuenta. Quien puede vincular un acudiente a alguien que ya existe no necesariamente
   * puede dar de alta gente nueva.
   */
  @Post()
  @RequirePermission("user.create")
  @Auditable({ action: "minor_profile.created", entityType: "person" })
  async crearMenor(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(CreateMinorRequest)) cuerpo: CreateMinorRequest,
  ): Promise<DependentResponse> {
    const creado = await this.servicio.crearMenor(
      clubDeLaSolicitud(req),
      cuerpo,
      usuario(req).userAccountId,
    );

    // La ruta no lleva parámetro y la respuesta trae `personId`, no `id`: el interceptor no puede
    // adivinar la entidad. Es el hueco que T-023 dejó abierto para estos casos.
    anotarEstadoPrevio(req, null, creado.personId);

    return creado;
  }
}

@Controller("waivers")
@UseGuards(TenantGuard, SessionGuard)
@UseInterceptors(AuditInterceptor)
export class WaiversController {
  constructor(
    private readonly servicio: WaiversService,
    private readonly prisma: PrismaService,
  ) {}

  /** El texto vigente lo puede leer cualquiera con sesión: es lo que está por aceptar. */
  @Get("current")
  async vigente(@Req() req: Solicitud): Promise<WaiverResponse> {
    return this.servicio.vigente(clubDeLaSolicitud(req));
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission("club.edit")
  @Auditable({ action: "waiver.published", entityType: "waiver_version" })
  async publicar(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(PublishWaiverRequest)) cuerpo: PublishWaiverRequest,
  ): Promise<WaiverResponse> {
    return this.servicio.publicar(clubDeLaSolicitud(req), cuerpo.body, usuario(req).userAccountId);
  }

  /**
   * Aceptar en nombre propio o de un menor a cargo (T-074).
   *
   * No exige permiso: aceptar el waiver es un acto **personal**, no administrativo. Quien acepta
   * por otra persona tiene que ser su acudiente vigente, y eso lo comprueba el servicio.
   */
  @Post("current/accept")
  @HttpCode(204)
  @SinPermiso("Aceptar el waiver es un acto personal: nadie necesita permiso para firmar por sí mismo.")
  @Auditable({ action: "waiver.accepted", entityType: "waiver_acceptance" })
  async aceptar(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(AcceptWaiverRequest)) cuerpo: AcceptWaiverRequest,
  ): Promise<void> {
    const clubId = clubDeLaSolicitud(req);
    const cuenta = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: usuario(req).userAccountId },
      select: { personId: true },
    });
    const cubierta = cuerpo.personId ?? cuenta.personId;

    // La entidad de la auditoría es **la persona cubierta**, no la aceptación: lo que alguien va a
    // buscar meses después es «¿este menor tenía waiver firmado?», no el identificador de la fila.
    anotarEstadoPrevio(req, { aceptadaPor: cuenta.personId }, cubierta);

    await this.servicio.aceptar(clubId, cuenta.personId, cubierta);
  }
}

function usuario(req: ConSessionUser): { userAccountId: string; sessionId: string } {
  const actual = req.sessionUser;

  if (actual === undefined) {
    throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
  }

  return actual;
}
