import type { ScopeKind } from "../identity/roles.js";
import { settingDefinition, type SettingKey } from "./catalog.js";

/** Una fila de `setting`: un valor fijado en un ámbito, vigente desde una fecha. */
export interface SettingValueRow {
  key: string;
  scope: ScopeKind;
  /** Nulo sólo cuando `scope = platform`. */
  scopeId: string | null;
  value: number | boolean | string;
  effectiveFrom: Date;
}

/** Desde dónde se pregunta. Determina qué se considera «explícito» y qué «heredado». */
export interface SettingContext {
  clubId: string | null;
  organizationId: string | null;
}

export type SettingSource = "explicit" | "inherited" | "default";

export interface SettingResolution {
  key: SettingKey;
  /** `null` cuando el default del catálogo es nulo, es decir «la función está desactivada». */
  value: number | boolean | string | null;
  source: SettingSource;
  /** En qué ámbito estaba fijado. Nulo cuando rige el default del catálogo. */
  scope: ScopeKind | null;
  /** Desde cuándo rige el valor que se devolvió. Nulo para el default. */
  effectiveFrom: Date | null;
}

/**
 * Qué valor rige para esta clave, en este contexto, en este instante (R-020-08, R-020-10).
 *
 * La herencia va de lo específico a lo general: **organización → club → plataforma → default del
 * catálogo**. Gana el ámbito más específico que tenga un valor vigente; dentro de un mismo ámbito,
 * gana el de fecha de vigencia más reciente que ya haya empezado.
 *
 * **Devuelve también de dónde salió el valor, y eso no es un adorno.** Sin esa información, la
 * pantalla de configuración no puede distinguir «el club decidió 18» de «nadie decidió nada y 18
 * es lo que trae el sistema», y son dos cosas distintas para quien administra: la primera se
 * respeta, la segunda se revisa. Es la mitad de HU-020-08.
 *
 * @param asOf instante contra el cual se evalúa. Pasarle una fecha pasada responde «qué regía
 *   entonces», que es lo que permite explicar un cobro viejo sin reconstruir nada.
 */
export function resolveSetting(
  key: SettingKey,
  filas: readonly SettingValueRow[],
  contexto: SettingContext,
  asOf: Date,
): SettingResolution {
  const vigentes = filas.filter(
    (fila) => fila.key === key && fila.effectiveFrom.getTime() <= asOf.getTime(),
  );

  // De lo más específico a lo más general: el primero que tenga valor, gana.
  const candidatos: { scope: ScopeKind; coincide: (fila: SettingValueRow) => boolean }[] = [
    {
      scope: "organization",
      coincide: (fila) =>
        fila.scope === "organization" &&
        contexto.organizationId !== null &&
        fila.scopeId === contexto.organizationId,
    },
    {
      scope: "club",
      coincide: (fila) =>
        fila.scope === "club" && contexto.clubId !== null && fila.scopeId === contexto.clubId,
    },
    { scope: "platform", coincide: (fila) => fila.scope === "platform" },
  ];

  const ambitoPreguntado = ambitoDelContexto(contexto);

  for (const candidato of candidatos) {
    const masReciente = ultimaVigente(vigentes.filter(candidato.coincide));

    if (masReciente !== undefined) {
      return {
        key,
        value: masReciente.value,
        // «Explícito» es haberlo fijado **en el ámbito por el que se pregunta**. Un valor de club
        // visto desde una organización está heredado, aunque para el club sea explícito: la
        // respuesta depende de quién pregunta, no sólo de dónde está el dato.
        source: candidato.scope === ambitoPreguntado ? "explicit" : "inherited",
        scope: candidato.scope,
        effectiveFrom: masReciente.effectiveFrom,
      };
    }
  }

  return {
    key,
    value: settingDefinition(key).default,
    source: "default",
    scope: null,
    effectiveFrom: null,
  };
}

function ambitoDelContexto(contexto: SettingContext): ScopeKind {
  if (contexto.organizationId !== null) return "organization";
  if (contexto.clubId !== null) return "club";

  return "platform";
}

/**
 * La más reciente de las que ya rigen. Empatar es imposible: la base tiene índice único sobre
 * `(scope, scope_id, key, effective_from)` — incluido el índice parcial que cubre el ámbito de
 * plataforma, donde el `NULL` engañaba al índice normal (T-201).
 */
function ultimaVigente(filas: readonly SettingValueRow[]): SettingValueRow | undefined {
  return filas.reduce<SettingValueRow | undefined>(
    (mejor, fila) =>
      mejor === undefined || fila.effectiveFrom.getTime() > mejor.effectiveFrom.getTime()
        ? fila
        : mejor,
    undefined,
  );
}
