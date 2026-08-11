import { err, ok, type Result } from "../shared/result.js";
import type { ScopeKind } from "../identity/roles.js";

/**
 * Qué tipo de dato admite una clave. Corto a propósito: un catálogo de configuración con un
 * sistema de tipos rico termina siendo un lenguaje, y entonces nadie puede leer un valor sin
 * consultar su definición.
 */
export type SettingType = "number" | "boolean" | "string";

export interface SettingDefinition {
  /**
   * El ámbito **más específico** en el que se puede fijar. Fijarlo en uno más amplio siempre se
   * puede —la plataforma define el default de todos los clubes—; en uno más específico, no: una
   * clave de plataforma que cada club pudiera cambiar dejaría de ser una regla de la plataforma.
   */
  readonly scope: ScopeKind;
  readonly type: SettingType;
  /** Lo que rige mientras nadie fije un valor. `null` significa «la función está desactivada». */
  readonly default: number | boolean | string | null;
  /** De dónde sale este default. Sin esto, en seis meses nadie sabe si el valor fue una decisión. */
  readonly source: string;
  /** Valores admitidos, cuando la clave no acepta cualquier cosa de su tipo. */
  readonly allowed?: readonly string[];
  readonly note?: string;
}

/**
 * El catálogo de configuración (`docs/08`, `plan.md` §0 de `specs/020`).
 *
 * **Vive en código y no en una tabla**, y la razón está en `plan.md`: agregar una clave es siempre
 * un cambio de código, porque alguien tiene que leerla. Una clave creable desde la base sin código
 * que la consuma es configuración que no aplica nada — un valor que el administrador cree estar
 * cambiando y no cambia nada, que es peor que no poder crearla. Lo que **sí** se cambia sin
 * desplegar, que es lo que exige P-04, es el **valor**.
 *
 * Sólo están las claves de los módulos ya construidos (010) y las transversales. Cada módulo nuevo
 * agrega las suyas cuando llega: un catálogo lleno de claves que nadie lee todavía no es
 * previsión, es ruido con apariencia de contrato.
 */
export const SETTING_CATALOG = {
  // ── Identidad y acceso (`docs/08` §9) ───────────────────────────────────────
  "auth.invitation_link_validity_days": {
    scope: "platform",
    type: "number",
    default: 7,
    source: "docs/08 §9 · PRD Parte II §4",
    note: "Lo consume isInvitationLinkValid (T-012), que ya lo recibe como parámetro.",
  },
  "auth.password_reset_link_validity_hours": {
    scope: "platform",
    type: "number",
    default: 1,
    source: "docs/08 §9 · PRD Parte II §7",
  },
  "auth.failed_login_lockout_threshold": {
    scope: "platform",
    type: "number",
    default: 5,
    source: "docs/08 §9 · PRD Parte II §5",
  },
  "auth.failed_login_lockout_minutes": {
    scope: "platform",
    type: "number",
    default: 15,
    source: "docs/08 §9 · PRD Parte II §5",
  },
  "auth.session_idle_timeout_hours": {
    scope: "platform",
    type: "number",
    // `null` = sin cierre por inactividad, que es **lo que hace el sistema hoy**: `SessionGuard`
    // (T-021) no escribe `last_seen_at` y por lo tanto no puede medir inactividad. `docs/08` deja
    // el valor «por definir», y poner un número aquí anunciaría un comportamiento inexistente.
    default: null,
    source: "docs/08 §9 · PRD Parte II §6 (exacto por definir)",
    note: "Hoy sin efecto: el cierre por inactividad no está implementado. Ver T-021.",
  },
  /**
   * Cuántas canchas nacen con un club (`docs/08` §5).
   *
   * No es una restricción: el club agrega o archiva las que quiera después. Es cuántas se crean el
   * primer día para que nadie tenga que registrarlas a mano antes de poder programar nada.
   */
  "field.count": {
    scope: "club",
    type: "number",
    default: 3,
    source: "docs/08 §5 · PRD Parte I §6",
  },

  /**
   * Horario en el que se puede programar, en la zona del club (`specs/040` R-040-06).
   *
   * Existe porque **las canchas no tienen iluminación**: lo que acota el día es la luz natural, no
   * una decisión del club. Por eso es una sola clave y no un atributo por cancha.
   */
  "field.operating_hours": {
    scope: "club",
    type: "string",
    default: "06:00-18:00",
    source: "specs/040 §13 — decidido con Daniel el 2026-08-11",
  },

  "identity.minor_profile_max_age": {
    scope: "club",
    type: "number",
    default: 18,
    source: "docs/08 §9 · docs/09 Q-15",
  },
  "identity.waiver_renewal_policy": {
    scope: "club",
    type: "string",
    default: "on_text_change",
    // Un solo valor admitido, y no es una omisión: es el único comportamiento implementado
    // (T-013 compara versiones). Agregar «anual» aquí prometería algo que el código no hace.
    allowed: ["on_text_change"],
    source: "docs/08 §9 · docs/09 Q-16",
  },

  // ── Notificaciones (`docs/08` §10) ──────────────────────────────────────────
  "notifications.whatsapp_enabled": {
    scope: "platform",
    type: "boolean",
    default: false,
    source: "docs/08 §10 · docs/09 Q-12",
  },
  "notifications.security_always_sent": {
    scope: "platform",
    type: "boolean",
    default: true,
    source: "docs/08 §10 · PRD Parte II §13",
    note: "Los avisos de seguridad se envían siempre; la preferencia del usuario no los apaga.",
  },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTING_CATALOG;

export type SettingRejection =
  | "clave_desconocida"
  | "tipo_invalido"
  | "valor_no_admitido"
  | "ambito_demasiado_especifico";

export function isSettingKey(clave: string): clave is SettingKey {
  return Object.hasOwn(SETTING_CATALOG, clave);
}

export function settingDefinition(clave: SettingKey): SettingDefinition {
  return SETTING_CATALOG[clave];
}

/** De lo más amplio a lo más específico. El orden **es** la regla de herencia (R-020-10). */
const ESPECIFICIDAD: Record<ScopeKind, number> = { platform: 0, club: 1, organization: 2 };

/**
 * ¿Se puede fijar esta clave en este ámbito?
 *
 * Fijarla en un ámbito más **amplio** que el declarado siempre se puede: así la plataforma define
 * el default de todos los clubes. En uno más **específico**, no — una clave de plataforma que cada
 * club pudiera cambiar por su cuenta dejaría de ser una regla de la plataforma, y las reglas de la
 * plataforma existen precisamente porque no son negociables por inquilino.
 */
export function canSetAt(clave: SettingKey, scope: ScopeKind): boolean {
  return ESPECIFICIDAD[scope] <= ESPECIFICIDAD[SETTING_CATALOG[clave].scope];
}

/**
 * Valida un valor contra el catálogo **al escribirlo** (R-020-09).
 *
 * Se valida al escribir y no al leer a propósito: un valor mal tipado que entra a la base rompe el
 * módulo que lo lee, en producción, lejos de donde alguien se equivocó. Al escribir, en cambio, hay
 * una persona mirando la pantalla que puede corregirlo.
 */
export function validateSettingValue(
  clave: string,
  valor: unknown,
  scope: ScopeKind,
): Result<{ key: SettingKey; value: number | boolean | string }, SettingRejection> {
  if (!isSettingKey(clave)) {
    return err("clave_desconocida");
  }

  // `settingDefinition` y no `SETTING_CATALOG[clave]`: el catálogo conserva los tipos literales de
  // cada entrada (`as const`), así que leerlo directo hace que `allowed` no exista en las claves
  // que no lo declaran. El accesor devuelve el tipo ancho, que es el que esta función necesita.
  const definicion = settingDefinition(clave);

  if (!canSetAt(clave, scope)) {
    return err("ambito_demasiado_especifico");
  }

  if (!coincideElTipo(definicion.type, valor)) {
    return err("tipo_invalido");
  }

  if (definicion.allowed !== undefined && !definicion.allowed.includes(String(valor))) {
    return err("valor_no_admitido");
  }

  return ok({ key: clave, value: valor as number | boolean | string });
}

function coincideElTipo(tipo: SettingType, valor: unknown): boolean {
  switch (tipo) {
    case "number":
      // `Number.isFinite` y no `typeof`: `NaN` e `Infinity` son `number` para JavaScript y no son
      // valores que ninguna regla del club pueda usar.
      return typeof valor === "number" && Number.isFinite(valor);
    case "boolean":
      return typeof valor === "boolean";
    case "string":
      return typeof valor === "string";
  }
}
