import { err, ok, type Result } from "../shared/result.js";
import type { RoleAssignmentRef } from "./canAssignRole.js";
import type { RoleName, ScopeKind } from "./roles.js";

/**
 * Permisos del módulo de identidad (`plan.md` §4, `docs/06` §4).
 *
 * Los nombres son los del plan y **forman parte del contrato**: aparecen en el decorador
 * `@RequirePermission()` de cada ruta y en la matriz de `docs/06`. Cada módulo nuevo agrega los
 * suyos a esta lista; inventar uno en una ruta sin registrarlo aquí no compila.
 */
export const PERMISSIONS = [
  "user.create",
  "user.edit",
  "user.suspend",
  "user.archive",
  "user.export",
  "role.assign",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Sobre qué se quiere actuar: el ámbito al que pertenece el recurso, no el del actor. */
export interface PermissionTarget {
  scope: ScopeKind;
  scopeId: string | null;
  /**
   * Club que contiene el ámbito: para `club` es el ámbito mismo; para `organization`, el club al
   * que pertenece; para `platform`, nulo. Igual que en `canAssignRole` — el dominio no consulta la
   * base de datos, el dato se le entrega (P-01).
   */
  clubId: string | null;
}

export type PermissionDenial =
  /** `platform` exige `scopeId` nulo; `club` y `organization` exigen uno. */
  | "scope_inconsistent"
  /** Falta el club del ámbito, sin el cual no se puede evaluar la autoridad de un `club_admin`. */
  | "scope_club_unknown"
  /** Ninguna asignación del actor cubre este permiso en este ámbito. */
  | "actor_not_authorized";

/** Lo que un rol puede hacer, y dónde. Ver la tabla de más abajo. */
interface AutoridadDelRol {
  /** Qué permisos ejerce. */
  permisos: readonly Permission[];
  /** Dónde los ejerce: compara la asignación del actor contra el ámbito del recurso. */
  alcanza: (asignacion: RoleAssignmentRef, target: PermissionTarget) => boolean;
}

/** Ningún ámbito. Se nombra en vez de repetir `() => false` para que la tabla se lea de un vistazo. */
const NINGUNO = (): boolean => false;

/**
 * Qué puede hacer cada rol (`docs/06` §4, matriz de permisos del módulo base).
 *
 * Cada rol declara en un solo lugar **qué** puede hacer y **dónde** puede hacerlo. Van juntos a
 * propósito: separados, se puede agregar un permiso a un rol y olvidar acotarle el ámbito, que es
 * la mitad silenciosa del problema.
 *
 * **Las tres filas administrativas tienen la misma lista de permisos hoy, y no es un error de
 * transcripción.** La diferencia entre un `club_admin` y un `organization_admin` no está en *qué*
 * permisos tienen sino en *dónde*: eso es lo que decide su `alcanza`. Se escribe igual la tabla
 * completa porque es la que hace que agregar un permiso obligue a decidir, rol por rol, quién lo
 * tiene — con una regla implícita («los administradores pueden todo») el permiso nuevo quedaría
 * concedido por omisión, que es como se abren los agujeros.
 *
 * Los roles operativos —comisario, instructor, petisero, tesorero, jugador— **no aparecen con
 * permisos administrativos a propósito**: la autoridad deportiva del comisario es sobre handicaps
 * y resultados (los tendrá en `specs/030`), no sobre cuentas de usuario.
 */
const AUTORIDAD_POR_ROL: Record<RoleName, AutoridadDelRol> = {
  /** Único rol que actúa sobre cualquier club, y sobre la plataforma misma (`docs/06` §4). */
  superadmin: {
    permisos: PERMISSIONS,
    alcanza: (asignacion) => asignacion.scope === "platform",
  },

  /**
   * Manda dentro de **su** club, incluidas las organizaciones que viven adentro — pero no sobre la
   * plataforma: configurar reglas globales es de `superadmin`, y un club no administra a otro.
   */
  club_admin: {
    permisos: PERMISSIONS,
    alcanza: (asignacion, target) =>
      asignacion.scope === "club" && asignacion.scopeId === target.clubId,
  },

  /** Sólo dentro de su propia organización; nunca sobre el club entero ni sobre otra. */
  organization_admin: {
    permisos: PERMISSIONS,
    alcanza: (asignacion, target) =>
      asignacion.scope === "organization" &&
      target.scope === "organization" &&
      asignacion.scopeId === target.scopeId,
  },

  commissioner: { permisos: [], alcanza: NINGUNO },
  instructor: { permisos: [], alcanza: NINGUNO },
  groom: { permisos: [], alcanza: NINGUNO },
  treasurer: { permisos: [], alcanza: NINGUNO },
  player: { permisos: [], alcanza: NINGUNO },
};

/**
 * ¿Puede este actor ejercer este permiso sobre este ámbito?
 *
 * Es la **puerta gruesa**: responde «este actor tiene autoridad administrativa aquí». La regla
 * fina de cada operación vive en su propia función —`canAssignRole` para otorgar roles (T-011)— y
 * se evalúa después, en el servicio. Las dos capas son a propósito (`plan.md` §7): el guard impide
 * que una petición de otro ámbito llegue siquiera a la lógica, y la función de dominio decide el
 * caso exacto. Que la puerta gruesa sea permisiva con el detalle no es un descuido: sería un
 * descuido si fuera la única.
 */
export function hasPermission(
  actor: { roles: readonly RoleAssignmentRef[] },
  permission: Permission,
  target: PermissionTarget,
): Result<void, PermissionDenial> {
  if (target.scope === "platform") {
    if (target.scopeId !== null) return err("scope_inconsistent");
  } else if (target.scopeId === null) {
    return err("scope_inconsistent");
  }

  if (target.scope === "club" && target.clubId !== target.scopeId) {
    return err("scope_inconsistent");
  }

  if (target.scope !== "platform" && target.clubId === null) {
    return err("scope_club_unknown");
  }

  const autorizado = actor.roles.some((asignacion) => autoriza(asignacion, permission, target));

  return autorizado ? ok(undefined) : err("actor_not_authorized");
}

function autoriza(
  asignacion: RoleAssignmentRef,
  permission: Permission,
  target: PermissionTarget,
): boolean {
  const autoridad = AUTORIDAD_POR_ROL[asignacion.role];

  // El ámbito primero y el permiso después: al revés da el mismo resultado, pero así queda claro
  // que ninguna autoridad existe fuera de su ámbito, ni siquiera para un permiso que el rol tiene.
  return autoridad.alcanza(asignacion, target) && autoridad.permisos.includes(permission);
}
