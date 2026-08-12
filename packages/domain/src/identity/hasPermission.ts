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
  // Identidad y acceso (`specs/010` plan §4)
  "user.create",
  "user.edit",
  "user.suspend",
  "user.archive",
  "user.export",
  "role.assign",
  "audit.view",
  // Club y configuración (`specs/020` plan §4). `membership.manage` y `setting.edit` son las dos
  // filas de la matriz de `docs/06` §4 que T-022a había dejado sin nombre canónico.
  "club.edit",
  "organization.manage",
  "season.manage",
  "membership.manage",
  "setting.edit",
  "platform.club.manage",
  /** Crear, editar y archivar canchas (`specs/040` R-040-06). */
  "field.edit",
  /**
   * Bloquear una franja de cancha.
   *
   * Va aparte de `field.edit` porque **el comisario lo tiene y no administra canchas**: su autoridad
   * es deportiva —la cancha está impracticable, se riega— no administrativa (`docs/06` §4). Con un
   * solo permiso, dárselo le habría dado también renombrar y archivar canchas.
   */
  "field.block",
  /**
   * Fijar el handicap de una persona (`specs/030` R-030-02).
   *
   * **Es el primer permiso que un `club_admin` NO tiene**, y por eso obligó a que la excepción de
   * esa fila dejara de ser una resta suelta. En el polo el handicap lo fija el comisario y nadie
   * más: «detrás puede haber un comité que decida, pero en la plataforma la única mano autorizada
   * es la del comisario» (`docs/source` §5).
   */
  "handicap.edit",
  /**
   * Crear, publicar, editar y cancelar prácticas (`specs/050`).
   *
   * **A diferencia de `handicap.edit`, éste sí es de los dos**: «el administrador del club (o el
   * comisario) crea la práctica» (`docs/source` §7). El comisario manda en lo deportivo y el
   * administrador organiza la semana del club; una práctica es las dos cosas a la vez.
   */
  "practice.manage",
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
 * **Hasta T-212 las tres filas administrativas eran idénticas y la diferencia estaba sólo en el
 * ámbito. Dejaron de serlo al llegar los permisos del módulo 020**, y eso es exactamente lo que la
 * tabla existía para capturar: un `organization_admin` no edita el club, ni sus temporadas, ni sus
 * categorías; un `club_admin` no administra la plataforma. Si la regla hubiera sido implícita
 * —«los administradores pueden todo»— los seis permisos nuevos habrían quedado concedidos por
 * omisión el día que se agregaron, que es como se abren los agujeros.
 *
 * Los roles operativos —comisario, instructor, petisero, tesorero, jugador— **no aparecen con
 * permisos administrativos a propósito**: la autoridad deportiva del comisario es sobre handicaps
 * y resultados, no sobre cuentas de usuario. Desde `specs/030` esa autoridad va en los dos
 * sentidos: `handicap.edit` es suyo y **de nadie más**, ni siquiera del `superadmin`.
 */
/**
 * Permisos que son **autoridad deportiva**: los ejerce el comisario y nadie más.
 *
 * Existe porque las filas administrativas se definen **por resta** —«todos los permisos menos
 * estos»—, así que un permiso nuevo queda concedido al administrador del club el día que se
 * declara, sin que nadie lo decida. Para `field.edit` eso era correcto. Para `handicap.edit` es
 * exactamente lo que `specs/030` R-030-02 prohíbe: en el polo el handicap lo fija el comisario, y
 * un sistema donde el administrador puede tocarlo rompe la línea de autoridad que el club sí
 * respeta en la cancha.
 *
 * **También queda fuera del `superadmin`**, que si no lo tendría por ser dueño de la plataforma.
 * No es que no pueda: puede asignarse el rol de comisario, que para eso tiene `role.assign`. La
 * diferencia es que así **queda registrado** — el cambio de rol se audita, y una autoridad que se
 * toma deja rastro donde una autoridad que se tiene no deja ninguno.
 */
const AUTORIDAD_DEPORTIVA: readonly Permission[] = ["handicap.edit"];

/** Ni la plataforma ni el deporte: lo que un administrador de club nunca ejerce por omisión. */
const FUERA_DEL_ALCANCE_DEL_CLUB_ADMIN: readonly Permission[] = [
  // Dar de alta o suspender clubes es de quien opera la plataforma; un club no administra a otro.
  "platform.club.manage",
  ...AUTORIDAD_DEPORTIVA,
];

const AUTORIDAD_POR_ROL: Record<RoleName, AutoridadDelRol> = {
  /** Único rol que actúa sobre cualquier club, y sobre la plataforma misma (`docs/06` §4). */
  superadmin: {
    permisos: PERMISSIONS.filter((permiso) => !AUTORIDAD_DEPORTIVA.includes(permiso)),
    alcanza: (asignacion) => asignacion.scope === "platform",
  },

  /**
   * Manda dentro de **su** club, incluidas las organizaciones que viven adentro — pero no sobre la
   * plataforma: configurar reglas globales es de `superadmin`, y un club no administra a otro.
   */
  club_admin: {
    // Todo lo suyo, menos administrar la plataforma: dar de alta o suspender clubes es de quien
    // opera la plataforma, no de un cliente — y un club que pudiera suspender clubes podría
    // suspender a otro.
    permisos: PERMISSIONS.filter((permiso) => !FUERA_DEL_ALCANCE_DEL_CLUB_ADMIN.includes(permiso)),
    alcanza: (asignacion, target) =>
      asignacion.scope === "club" && asignacion.scopeId === target.clubId,
  },

  /** Sólo dentro de su propia organización; nunca sobre el club entero ni sobre otra. */
  organization_admin: {
    // Su organización y su gente. **No** el club: ni sus datos, ni sus temporadas, ni sus
    // categorías de membresía, ni por supuesto la plataforma. Con la lista completa —como estaba
    // cuando todas las filas eran iguales— un administrador de organización habría podido editar
    // el club entero en cuanto existieran esas rutas.
    permisos: [
      "user.create",
      "user.edit",
      "user.suspend",
      "user.archive",
      "user.export",
      "role.assign",
      "audit.view",
      "organization.manage",
      "setting.edit",
    ],
    alcanza: (asignacion, target) =>
      asignacion.scope === "organization" &&
      target.scope === "organization" &&
      asignacion.scopeId === target.scopeId,
  },

  /**
   * Autoridad **deportiva** dentro de su club: fija los handicaps y puede sacar una cancha de juego
   * por sus condiciones. Nada de la administración (`docs/06` §4).
   */
  commissioner: {
    permisos: ["field.block", "handicap.edit", "practice.manage"],
    alcanza: (asignacion, target) =>
      asignacion.scope === "club" && asignacion.scopeId === target.clubId,
  },
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
