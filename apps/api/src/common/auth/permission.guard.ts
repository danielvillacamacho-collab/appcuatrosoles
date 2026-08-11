import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { RoleName as RoleNameDb, ScopeKind as ScopeKindDb } from "@prisma/client";
import { hasPermission, type Permission, type RoleName, type ScopeKind } from "@polo/domain";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ConSessionUser } from "./current-user.js";
import { PERMISO_REQUERIDO } from "./require-permission.js";

/**
 * El club de la solicitud, resuelto por subdominio.
 *
 * **Lo llena `TenantGuard` (T-020), que hoy no existe** porque depende de la tabla `club` del
 * módulo 020 — ver la nota de esa tarea en `tasks.md`. El contrato se declara aquí, y no se
 * improvisa después, para que la dependencia sea visible en el código en vez de vivir en la
 * cabeza de alguien: sin tenant, este guard **no adivina** y no deja pasar.
 */
export interface ConTenant {
  tenant?: { clubId: string };
}

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
    const permiso = this.reflector.getAllAndOverride<Permission | undefined>(PERMISO_REQUERIDO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    // Una ruta sin permiso declarado es de lectura pública dentro de la sesión (p. ej. `/me`). Que
    // una ruta **mutante** llegue aquí sin declararlo es imposible: la aplicación no arranca
    // (`permissions-declared.service.ts`).
    if (permiso === undefined) {
      return true;
    }

    const req = contexto.switchToHttp().getRequest<ConSessionUser & ConTenant>();
    const usuario = req.sessionUser;

    if (usuario === undefined) {
      throw new UnauthorizedException();
    }

    const tenant = req.tenant;

    if (tenant === undefined) {
      // Error de programación —falta `TenantGuard` antes de éste—, no del usuario. Se responde
      // como error interno y no como `403`: un `403` mentiría diciendo «no tienes permiso» cuando
      // lo que pasa es que el servidor no sabe en qué club está parado.
      throw new Error("PermissionGuard sin tenant: TenantGuard debe correr antes (T-020).");
    }

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
      permiso,
      // Ámbito de club: es el tenant de la solicitud. Las rutas de ámbito de **organización**
      // (T-052, T-054) necesitan además saber a qué organización se refiere el cuerpo de la
      // petición; ese resolvedor entra con la primera de ellas, no antes de tener un caso real.
      { scope: "club", scopeId: tenant.clubId, clubId: tenant.clubId },
    );

    if (!veredicto.ok) {
      throw new ForbiddenException();
    }

    return true;
  }
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
