import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { UserAccountStatus } from "@prisma/client";
import {
  AcceptInvitationRequest,
  AssignRoleRequest,
  CreateUserRequest,
  UpdateUserRequest,
  UserResponse,
} from "@polo/contracts";
import type { RoleName, RoleAssignmentRef } from "@polo/domain";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable, anotarEstadoPrevio, type ConAuditoria } from "../common/audit/auditable.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission, SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../tenant/base-domain.js";
import { ClubDirectory } from "../tenant/club-directory.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { UsersService, type Actor } from "./users.service.js";

type Solicitud = ConTenant & ConSessionUser & ConAuditoria;

@Controller("users")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class UsersController {
  constructor(
    private readonly servicio: UsersService,
    private readonly prisma: PrismaService,
    private readonly clubes: ClubDirectory,
    @Inject(BASE_DOMAIN) private readonly baseDomain: string,
  ) {}

  @Get()
  // Ámbito amplio: un administrador de organización lista **a su gente**, y quién es su gente lo
  // decide el servicio (T-054). El guard sólo comprueba que tenga autoridad en algún lado del club.
  @RequirePermission("user.edit", { ambitoAmplio: true })
  async listar(
    @Req() req: Solicitud,
    @Query("status") status?: string,
    @Query("role") role?: string,
    @Query("organizationId") organizationId?: string,
    @Query("membershipCategoryId") membershipCategoryId?: string,
    @Query("q") q?: string,
  ): Promise<UserResponse[]> {
    return this.servicio.listar(await this.actor(req), clubDeLaSolicitud(req), {
      ...(status === undefined ? {} : { status: status as UserAccountStatus }),
      ...(role === undefined ? {} : { role: role as RoleName }),
      ...(organizationId === undefined ? {} : { organizationId }),
      ...(membershipCategoryId === undefined ? {} : { membershipCategoryId }),
      ...(q === undefined ? {} : { q }),
    });
  }

  /**
   * `GET /users/export` (T-059).
   *
   * **Va antes de `GET /:id`**: si estuviera después, `export` entraría como identificador y la
   * ruta respondería `404`. Es el orden de declaración lo que decide, no la especificidad.
   */
  @Get("export")
  @RequirePermission("user.export", { ambitoAmplio: true })
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="usuarios.csv"')
  async exportar(
    @Req() req: Solicitud,
    @Query("status") status?: string,
    @Query("role") role?: string,
    @Query("organizationId") organizationId?: string,
    @Query("q") q?: string,
  ): Promise<string> {
    const usuarios = await this.servicio.listar(await this.actor(req), clubDeLaSolicitud(req), {
      ...(status === undefined ? {} : { status: status as UserAccountStatus }),
      ...(role === undefined ? {} : { role: role as RoleName }),
      ...(organizationId === undefined ? {} : { organizationId }),
      ...(q === undefined ? {} : { q }),
    });

    return aCsv(usuarios);
  }

  @Get(":id")
  @RequirePermission("user.edit")
  async detalle(@Req() req: Solicitud, @Param("id") id: string): Promise<UserResponse> {
    return this.servicio.detalle(clubDeLaSolicitud(req), id);
  }

  @Post()
  // Con `organizationId` en el cuerpo, el permiso se evalúa contra esa organización; sin él, contra
  // el club. Es lo que permite que un administrador de organización cree a su instructor sin poder
  // crear un administrador de club (T-052, R-010-04).
  @RequirePermission("user.create", { organizacion: { desde: "body", campo: "organizationId", opcional: true } })
  @Auditable({ action: "user.created", entityType: "user_account" })
  async crear(
    @Req() req: Solicitud,
    @Body(new ZodValidationPipe(CreateUserRequest)) cuerpo: CreateUserRequest,
  ): Promise<UserResponse> {
    const clubId = clubDeLaSolicitud(req);

    return this.servicio.crear(await this.actor(req), clubId, cuerpo, await this.urlDelClub(clubId));
  }

  @Patch(":id")
  @RequirePermission("user.edit")
  @Auditable({ action: "user.updated", entityType: "user_account" })
  async actualizar(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateUserRequest)) cuerpo: UpdateUserRequest,
  ): Promise<UserResponse> {
    const clubId = clubDeLaSolicitud(req);

    anotarEstadoPrevio(req, await this.servicio.detalle(clubId, id), id);

    return this.servicio.actualizar(clubId, id, cuerpo);
  }

  @Post(":id/invite")
  @HttpCode(202)
  @RequirePermission("user.create")
  @Auditable({ action: "user.invitation_resent", entityType: "user_account" })
  async reenviar(@Req() req: Solicitud, @Param("id") id: string): Promise<{ mensaje: string }> {
    const clubId = clubDeLaSolicitud(req);

    await this.servicio.reenviarInvitacion(clubId, id, await this.urlDelClub(clubId));

    return { mensaje: "Invitación reenviada. El enlace anterior dejó de servir." };
  }

  @Post(":id/suspend")
  @HttpCode(200)
  @RequirePermission("user.suspend")
  @Auditable({ action: "user.suspended", entityType: "user_account" })
  async suspender(@Req() req: Solicitud, @Param("id") id: string): Promise<UserResponse> {
    return this.cambiarEstado(req, id, "suspended");
  }

  @Post(":id/reactivate")
  @HttpCode(200)
  @RequirePermission("user.suspend")
  @Auditable({ action: "user.reactivated", entityType: "user_account" })
  async reactivar(@Req() req: Solicitud, @Param("id") id: string): Promise<UserResponse> {
    return this.cambiarEstado(req, id, "active");
  }

  @Post(":id/archive")
  @HttpCode(200)
  @RequirePermission("user.archive")
  @Auditable({ action: "user.archived", entityType: "user_account" })
  async archivar(@Req() req: Solicitud, @Param("id") id: string): Promise<UserResponse> {
    return this.cambiarEstado(req, id, "archived");
  }

  @Post(":id/restore")
  @HttpCode(200)
  @RequirePermission("user.archive")
  @Auditable({ action: "user.restored", entityType: "user_account" })
  async restaurar(@Req() req: Solicitud, @Param("id") id: string): Promise<UserResponse> {
    return this.cambiarEstado(req, id, "active");
  }

  @Post(":id/roles")
  @HttpCode(201)
  // El ámbito sale del cuerpo cuando el rol es de organización: así un administrador de
  // organización otorga en la suya, y sólo en la suya (T-060, R-010-04).
  @RequirePermission("role.assign", { organizacion: { desde: "body", campo: "organizationId", opcional: true } })
  @Auditable({ action: "role.assigned", entityType: "user_account" })
  async otorgarRol(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AssignRoleRequest)) cuerpo: AssignRoleRequest,
  ): Promise<UserResponse> {
    const clubId = clubDeLaSolicitud(req);

    anotarEstadoPrevio(req, await this.servicio.detalle(clubId, id), id);

    return this.servicio.otorgarRol(
      await this.actor(req),
      clubId,
      id,
      cuerpo.role,
      cuerpo.scope,
      // El club sale del subdominio, nunca del cuerpo (R-020-01).
      cuerpo.scope === "organization" ? (cuerpo.organizationId ?? "") : clubId,
    );
  }

  @Delete(":id/roles/:roleAssignmentId")
  @HttpCode(200)
  @RequirePermission("role.assign", { ambitoAmplio: true })
  @Auditable({ action: "role.revoked", entityType: "user_account" })
  async retirarRol(
    @Req() req: Solicitud,
    @Param("id") id: string,
    @Param("roleAssignmentId") roleAssignmentId: string,
  ): Promise<UserResponse> {
    const clubId = clubDeLaSolicitud(req);

    anotarEstadoPrevio(req, await this.servicio.detalle(clubId, id), id);

    return this.servicio.retirarRol(await this.actor(req), clubId, id, roleAssignmentId);
  }

  private async cambiarEstado(
    req: Solicitud,
    id: string,
    estado: UserAccountStatus,
  ): Promise<UserResponse> {
    const clubId = clubDeLaSolicitud(req);

    anotarEstadoPrevio(req, await this.servicio.detalle(clubId, id), id);

    return this.servicio.cambiarEstado(await this.actor(req), clubId, id, estado);
  }

  /** Los roles vigentes de quien pide: lo que `canAssignRole` necesita para decidir (T-011). */
  private async actor(req: Solicitud): Promise<Actor> {
    const usuario = req.sessionUser;

    if (usuario === undefined) {
      throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
    }

    const roles = await this.prisma.roleAssignment.findMany({
      where: { userAccountId: usuario.userAccountId, revokedAt: null },
      select: { role: true, scope: true, scopeId: true },
    });

    return { userAccountId: usuario.userAccountId, roles: roles as RoleAssignmentRef[] };
  }

  private async urlDelClub(clubId: string): Promise<string> {
    const club = (await this.clubes.all()).find((candidato) => candidato.id === clubId);
    const esquema = process.env.NODE_ENV === "production" ? "https" : "http";

    return `${esquema}://${club?.slug ?? ""}.${this.baseDomain}`;
  }
}

/**
 * La invitación se acepta **sin sesión**: es lo que uno hace antes de tener una.
 *
 * Va en su propio controlador porque cuelga de `/auth`, no de `/users`: quien la usa no está
 * administrando usuarios, está entrando por primera vez.
 */
@Controller("auth/invitation")
@UseGuards(TenantGuard)
export class InvitationController {
  constructor(private readonly servicio: UsersService) {}

  @Post("accept")
  @HttpCode(204)
  @SinPermiso("Aceptar la invitación es lo que hace quien todavía no tiene cuenta utilizable.")
  async aceptar(
    @Body(new ZodValidationPipe(AcceptInvitationRequest)) cuerpo: AcceptInvitationRequest,
  ): Promise<void> {
    await this.servicio.aceptarInvitacion(cuerpo.token, cuerpo.newPassword);
  }
}

/**
 * CSV con el mismo filtro que el listado (T-059).
 *
 * Cada campo va entre comillas y las comillas internas se duplican: un nombre con una coma —«Pérez,
 * María»— partiría la fila en dos columnas, y un nombre con comillas rompería el archivo entero.
 */
function aCsv(usuarios: UserResponse[]): string {
  const encabezado = ["nombre", "correo", "telefono", "estado", "categoria", "roles"];
  const filas = usuarios.map((usuario) => [
    usuario.fullName,
    usuario.email,
    usuario.phone ?? "",
    usuario.status,
    usuario.membershipCategory?.name ?? "",
    usuario.roles.map((rol) => rol.role).join(" "),
  ]);

  return [encabezado, ...filas]
    .map((fila) => fila.map((campo) => `"${campo.replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
