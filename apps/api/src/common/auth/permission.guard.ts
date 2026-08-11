import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleName as RoleNameDb, ScopeKind as ScopeKindDb } from "@prisma/client";
import {
  hasPermission,
  type PermissionTarget,
  type RoleName,
  type ScopeKind,
} from "@polo/domain";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ConTenant } from "../../tenant/tenant-context.js";
import type { ConSessionUser } from "./current-user.js";
import { PERMISO_REQUERIDO, type PermisoDeclarado } from "./require-permission.js";

/**
 * Exige el permiso que la ruta declaró con `@RequirePermission()` (`docs/03` §6).
 *
 * Corre **después** de `SessionGuard` —necesita saber quién pide— y **después** de `TenantGuard`
 * —necesita saber en qué club se está actuando—. Si falta cualquiera de los dos, no concede: un
 * guard de autorización que ante la duda deja pasar no es un guard.
 *
 * Evalúa contra `hasPermission` (T-022a), en `packages/domain`: la regla de quién puede qué es de
 * negocio y se prueba sin levantar nada. Aquí sólo está la plomería — leer el decorador, cargar
 * las asignaciones vigentes, traducir el vocabulario de la base al del dominio.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const declarado = this.reflector.getAllAndOverride<PermisoDeclarado | undefined>(
      PERMISO_REQUERIDO,
      [contexto.getHandler(), contexto.getClass()],
    );

    // Una ruta sin permiso declarado es de lectura pública dentro de la sesión (p. ej. `/me`). Que
    // una ruta **mutante** llegue aquí sin declararlo es imposible: la aplicación no arranca
    // (`permissions-declared.service.ts`).
    if (declarado === undefined) {
      return true;
    }

    const req = contexto
      .switchToHttp()
      .getRequest<ConSessionUser & ConTenant & { params?: unknown; body?: unknown }>();
    const usuario = req.sessionUser;

    if (usuario === undefined) {
      throw new UnauthorizedException();
    }

    const target = await this.resolverAmbito(declarado, req);

    const asignaciones = await this.prisma.roleAssignment.findMany({
      // Sólo las vigentes: una asignación revocada no otorga nada, y filtrarlo aquí evita que cada
      // llamador tenga que acordarse (R-010-11, T-061).
      where: { userAccountId: usuario.userAccountId, revokedAt: null },
      select: { role: true, scope: true, scopeId: true },
    });

    const veredicto = hasPermission(
      {
        roles: asignaciones.map((asignacion) => ({
          role: aRolDeDominio(asignacion.role),
          scope: aAmbitoDeDominio(asignacion.scope),
          scopeId: asignacion.scopeId,
        })),
      },
      declarado.permission,
      target,
    );

    if (!veredicto.ok) {
      throw new ForbiddenException();
    }

    return true;
  }

  /**
   * Contra qué se evalúa el permiso: el club de la solicitud, o una organización concreta si la
   * ruta lo declaró (T-223).
   *
   * **La organización tiene que pertenecer al club del tenant, y si no, la respuesta es `404`.**
   * No `403`: un `403` confirmaría que esa organización existe en algún lado, y entre inquilinos
   * eso ya es una fuga (P-05, `docs/03` §3). Se comprueba con una consulta acotada por `club_id`,
   * no comparando después de traer la fila — así ni siquiera se lee el dato de otro club.
   */
  private async resolverAmbito(
    declarado: PermisoDeclarado,
    req: ConTenant & { params?: unknown; body?: unknown },
  ): Promise<PermissionTarget> {
    // Ruta de plataforma: no actúa dentro de ningún club y por lo tanto no necesita tenant.
    if (declarado.plataforma === true) {
      return { scope: "platform", scopeId: null, clubId: null };
    }

    const tenant = req.tenant;

    if (tenant === undefined) {
      // Error de programación —falta `TenantGuard` antes de éste, o la ruta debía declararse de
      // plataforma—, no del usuario. Se responde como error interno y no como `403`: un `403`
      // mentiría diciendo «no tienes permiso» cuando lo que pasa es que el servidor no sabe en
      // qué club está parado.
      throw new Error("PermissionGuard sin tenant: falta TenantGuard (T-221) o `{ plataforma: true }`.");
    }

    const clubId = tenant.clubId;

    if (declarado.organizacion === undefined) {
      return { scope: "club", scopeId: clubId, clubId };
    }

    const origen = declarado.organizacion.desde === "params" ? req.params : req.body;
    const organizationId = leerCampo(origen, declarado.organizacion.campo);

    if (organizationId === undefined) {
      // La ruta declaró que su ámbito sale de un campo que no llegó. Es un error de programación
      // —o un cliente probando—, y en cualquier caso no hay ámbito que evaluar: no se concede.
      throw new NotFoundException();
    }

    const organizacion = await this.prisma.organization.findFirst({
      where: { id: organizationId, clubId },
      select: { id: true },
    });

    if (organizacion === null) {
      throw new NotFoundException();
    }

    return { scope: "organization", scopeId: organizacion.id, clubId };
  }
}

function leerCampo(origen: unknown, campo: string): string | undefined {
  if (origen === null || typeof origen !== "object") {
    return undefined;
  }

  const valor: unknown = (origen as Record<string, unknown>)[campo];

  return typeof valor === "string" ? valor : undefined;
}

/**
 * Traducción del vocabulario de la base al del dominio (P-01), con el mismo truco que
 * `SessionGuard`: el cuerpo es la identidad y lo que trabaja es la firma. Si el esquema gana un rol
 * o un ámbito que el dominio no conoce, esto deja de compilar en vez de colarse sin evaluar.
 */
function aRolDeDominio(role: RoleNameDb): RoleName {
  return role;
}

function aAmbitoDeDominio(scope: ScopeKindDb): ScopeKind {
  return scope;
}
