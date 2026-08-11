import { SetMetadata, type CustomDecorator } from "@nestjs/common";

export const AUDITABLE = "auditable";

export interface AuditableMetadata {
  /** Qué pasó, en pasado y en inglés: `user.created`, `role.assigned`, `user.suspended`. */
  action: string;
  /** Sobre qué tipo de entidad, con el nombre de la tabla: `user_account`, `role_assignment`. */
  entityType: string;
}

/**
 * Marca una mutación para que quede registrada en `audit_log` (`docs/03` §9, R-010-11).
 *
 * ```ts
 * @Auditable({ action: "user.suspended", entityType: "user_account" })
 * @Post(":id/suspend")
 * suspender() { ... }
 * ```
 *
 * El interceptor infiere solo lo que puede: quién, cuándo, en qué club, con qué `requestId` y
 * sobre qué identificador. Lo que **no** puede inferir —el estado previo de la entidad— lo aporta
 * el servicio con `anotarEstadoPrevio`, porque sólo él sabe qué leyó antes de escribir.
 */
export function Auditable(metadata: AuditableMetadata): CustomDecorator<string> {
  return SetMetadata(AUDITABLE, metadata);
}

/** Lo que el servicio le deja al interceptor sobre la solicitud en curso. */
export interface ConAuditoria {
  auditoria?: {
    before?: unknown;
    /** Cuando el identificador de la entidad no sale de la respuesta ni de la ruta. */
    entityId?: string;
  };
}

/**
 * Deja constancia del estado **previo** de la entidad para que el interceptor lo guarde.
 *
 * Lo llama el servicio, no el controlador, y en el momento en que ya leyó la fila y todavía no la
 * escribió. Es la única parte de la auditoría que no se puede automatizar: leer «el antes» de
 * forma genérica exigiría que el interceptor supiera qué tabla y qué identificador consultar para
 * cada acción, y una consulta adivinada en la ruta caliente es peor que una línea explícita.
 */
export function anotarEstadoPrevio(req: ConAuditoria, before: unknown, entityId?: string): void {
  req.auditoria = { ...req.auditoria, before, ...(entityId === undefined ? {} : { entityId }) };
}

/** Claves que nunca se guardan en la auditoría, aunque vengan en el estado previo o posterior. */
const CLAVES_PROHIBIDAS = new Set(["password", "passwordhash", "tokenhash", "token", "iphash"]);

/**
 * Quita del estado serializado lo que no debe quedar guardado para siempre.
 *
 * `audit_log` es **append-only** (P-07): lo que entra ahí no se puede corregir ni borrar después,
 * ni siquiera por un superusuario de la base. Un hash de contraseña que se cuele en un `before`
 * queda ahí para el resto de la vida del sistema — por eso la limpieza va antes de escribir y por
 * nombre de campo, no confiando en que ningún servicio lo pase por descuido.
 */
export function sinDatosSensibles(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(sinDatosSensibles);
  }

  if (valor === null || typeof valor !== "object") {
    return valor;
  }

  return Object.fromEntries(
    Object.entries(valor)
      .filter(([clave]) => !CLAVES_PROHIBIDAS.has(clave.toLowerCase()))
      .map(([clave, anidado]) => [clave, sinDatosSensibles(anidado)]),
  );
}
