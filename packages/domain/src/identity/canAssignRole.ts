import { err, ok, type Result } from "../shared/result.js";
import { roleAllowsScope, type RoleName, type ScopeKind } from "./roles.js";

/** Una asignación de rol vigente del actor. Las revocadas no se pasan a esta función. */
export interface RoleAssignmentRef {
  role: RoleName;
  scope: ScopeKind;
  /** Club u organización según el ámbito. Nulo **sólo** cuando el ámbito es `platform`. */
  scopeId: string | null;
}

/** Lo que se quiere otorgar. */
export interface RoleGrantRequest {
  role: RoleName;
  scope: ScopeKind;
  scopeId: string | null;
  /**
   * Club al que pertenece el ámbito del rol: para `scope = club` es el club mismo; para
   * `organization`, el club que la contiene; para `platform`, nulo.
   *
   * Hace falta porque un `club_admin` sólo manda dentro de **su** club, y para saber si una
   * organización cae dentro de él hay que conocer ese vínculo. El dominio no consulta la base de
   * datos: el dato se le entrega (P-01).
   */
  clubId: string | null;
}

export type RoleGrantDenial =
  /** El rol no existe en ese ámbito (p. ej. un comisario «de organización»). */
  | "rol_no_admite_ese_ambito"
  /** `platform` exige `scopeId` nulo; `club` y `organization` exigen uno. */
  | "ambito_incoherente"
  /** Falta el club del ámbito, sin el cual no se puede evaluar la autoridad de un `club_admin`. */
  | "club_del_ambito_desconocido"
  /** El actor no tiene ninguna asignación que lo autorice a otorgar esto. */
  | "actor_no_autorizado";

/**
 * Roles de organización que un `organization_admin` puede otorgar dentro de **su** organización.
 *
 * **`organization_admin` no está en la lista, a propósito.** `docs/06` §4 dice que ese rol lo
 * otorga «`superadmin` o `club_admin`», mientras el spec (R-010-04), leído literalmente
 * —«`organization_admin` sólo otorga roles dentro de su propia organización»— lo permitiría. Se
 * resolvió por el lado del menor privilegio: si un administrador de organización pudiera nombrar
 * a otro, una sola cuenta comprometida se multiplica sin que ningún administrador del club se
 * entere. El costo es que los administradores de organización los nombra el club, que con una o
 * dos organizaciones es un trámite de un minuto. Queda anotado como decisión revisable.
 */
const OTORGA_ORGANIZATION_ADMIN: readonly RoleName[] = ["instructor", "groom", "treasurer"];

/**
 * ¿Puede este actor otorgar este rol en este ámbito? (R-010-04, docs/06 §4)
 *
 * Es la función más delicada del módulo: un error aquí no es un bug de permisos, es una escalada
 * de privilegios. Por eso decide sobre datos explícitos y no consulta nada.
 *
 * Nota sobre `player`: es el **rol base de toda cuenta activa** (docs/02 §B) y lo asigna el
 * sistema al activarse la cuenta, no un administrador por criterio propio. Esta función cubre los
 * otorgamientos **discrecionales**; si alguien lo otorga a mano, se trata como el rol de club que
 * es.
 */
export function canAssignRole(
  actor: { roles: readonly RoleAssignmentRef[] },
  request: RoleGrantRequest,
): Result<void, RoleGrantDenial> {
  if (!roleAllowsScope(request.role, request.scope)) {
    return err("rol_no_admite_ese_ambito");
  }

  if (request.scope === "platform") {
    if (request.scopeId !== null) return err("ambito_incoherente");
  } else if (request.scopeId === null) {
    return err("ambito_incoherente");
  }

  // Para un ámbito de club, el club del ámbito ES el ámbito: si llegan distintos, el dato viene mal.
  if (request.scope === "club" && request.clubId !== request.scopeId) {
    return err("ambito_incoherente");
  }

  if (request.scope !== "platform" && request.clubId === null) {
    return err("club_del_ambito_desconocido");
  }

  const autorizado = actor.roles.some((asignacion) => autoriza(asignacion, request));

  return autorizado ? ok(undefined) : err("actor_no_autorizado");
}

function autoriza(asignacion: RoleAssignmentRef, request: RoleGrantRequest): boolean {
  switch (asignacion.role) {
    /**
     * El superadministrador es el único que puede crear otro superadministrador, y el único que
     * puede actuar sobre cualquier club. Es un rol interno del equipo que opera la plataforma, no
     * del club (docs/06 §4).
     */
    case "superadmin":
      return asignacion.scope === "platform";

    /** Manda en todo lo de **su** club, incluidas las organizaciones que viven dentro. */
    case "club_admin":
      return (
        asignacion.scope === "club" &&
        asignacion.scopeId === request.clubId &&
        request.role !== "superadmin"
      );

    /** Sólo dentro de su propia organización, y sin poder nombrar a otro como él. */
    case "organization_admin":
      return (
        asignacion.scope === "organization" &&
        request.scope === "organization" &&
        asignacion.scopeId === request.scopeId &&
        OTORGA_ORGANIZATION_ADMIN.includes(request.role)
      );

    /**
     * Los demás roles no otorgan roles. En particular el **comisario**: su autoridad es
     * deportiva (handicaps, equipos, resultados), no administrativa. Que la máxima autoridad
     * del polo no pueda repartir permisos es intencional, no un olvido.
     */
    default:
      return false;
  }
}
