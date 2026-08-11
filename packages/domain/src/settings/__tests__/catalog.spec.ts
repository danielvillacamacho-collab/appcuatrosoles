import { describe, expect, it } from "vitest";
import {
  canSetAt,
  isSettingKey,
  SETTING_CATALOG,
  settingDefinition,
  validateSettingValue,
  type SettingKey,
} from "../catalog.js";

const CLAVES = Object.keys(SETTING_CATALOG) as SettingKey[];

describe("El catálogo está bien formado", () => {
  it("toda clave declara ámbito, tipo y fuente documental", () => {
    const incompletas = CLAVES.filter((clave) => {
      const definicion = settingDefinition(clave);

      return (
        definicion.scope === undefined ||
        definicion.type === undefined ||
        definicion.source === undefined ||
        definicion.source.length === 0
      );
    });

    expect(incompletas).toEqual([]);
  });

  it("el valor por defecto respeta el tipo declarado, o es nulo", () => {
    // Un default que no cumple su propio tipo es una bomba de relojería: rige hasta que alguien
    // fija un valor, y explota en el módulo que lo lee, no aquí.
    const inconsistentes = CLAVES.filter((clave) => {
      const { type, default: valor } = settingDefinition(clave);

      if (valor === null) return false;

      return typeof valor !== type;
    });

    expect(inconsistentes).toEqual([]);
  });

  it("los valores admitidos, cuando existen, incluyen al default", () => {
    const rotas = CLAVES.filter((clave) => {
      const { allowed, default: valor } = settingDefinition(clave);

      return allowed !== undefined && valor !== null && !allowed.includes(String(valor));
    });

    expect(rotas).toEqual([]);
  });

  it("las claves siguen el formato «modulo.nombre», en inglés y minúsculas", () => {
    // Es lo que permite leer una clave suelta en un log o en una fila de auditoría y saber de qué
    // módulo habla, sin buscarla.
    const malFormadas = CLAVES.filter((clave) => !/^[a-z]+\.[a-z0-9_]+$/.test(clave));

    expect(malFormadas).toEqual([]);
  });

  it("no hay claves repetidas", () => {
    expect(new Set(CLAVES).size).toBe(CLAVES.length);
  });
});

describe("isSettingKey · una clave inventada no existe", () => {
  it("reconoce una clave del catálogo", () => {
    expect(isSettingKey("auth.invitation_link_validity_days")).toBe(true);
  });

  it("rechaza una que no está", () => {
    expect(isSettingKey("auth.invitation_link_validity_dias")).toBe(false);
  });

  it("no confunde una propiedad heredada de Object con una clave", () => {
    // `"toString" in objeto` diría que sí. Por eso el catálogo se consulta con `Object.hasOwn`.
    expect(isSettingKey("toString")).toBe(false);
    expect(isSettingKey("constructor")).toBe(false);
  });
});

describe("canSetAt · dónde se puede fijar cada clave", () => {
  it("una clave de plataforma no se puede fijar por club ni por organización", () => {
    // Si cada club pudiera cambiar el bloqueo por intentos fallidos, dejaría de ser una regla de
    // la plataforma — y las reglas de la plataforma existen porque no son negociables por cliente.
    expect(canSetAt("auth.failed_login_lockout_threshold", "platform")).toBe(true);
    expect(canSetAt("auth.failed_login_lockout_threshold", "club")).toBe(false);
    expect(canSetAt("auth.failed_login_lockout_threshold", "organization")).toBe(false);
  });

  it("una clave de club se puede fijar por club y también, como default, por plataforma", () => {
    expect(canSetAt("identity.minor_profile_max_age", "club")).toBe(true);
    expect(canSetAt("identity.minor_profile_max_age", "platform")).toBe(true);
    expect(canSetAt("identity.minor_profile_max_age", "organization")).toBe(false);
  });
});

describe("validateSettingValue · se valida al escribir, no al leer", () => {
  it("acepta un valor del tipo correcto", () => {
    expect(validateSettingValue("identity.minor_profile_max_age", 21, "club")).toEqual({
      ok: true,
      value: { key: "identity.minor_profile_max_age", value: 21 },
    });
  });

  it("rechaza una clave que no está en el catálogo (R-020-09)", () => {
    // Una configuración que acepta cualquier clave es una configuración que nadie sabe leer: el
    // administrador cree haber cambiado algo y no cambió nada.
    expect(validateSettingValue("practice.decision_time", "18:00", "club")).toEqual({
      ok: false,
      error: "clave_desconocida",
    });
  });

  it("rechaza un tipo equivocado", () => {
    expect(validateSettingValue("identity.minor_profile_max_age", "dieciocho", "club")).toEqual({
      ok: false,
      error: "tipo_invalido",
    });
    expect(validateSettingValue("notifications.whatsapp_enabled", "true", "platform")).toEqual({
      ok: false,
      error: "tipo_invalido",
    });
  });

  it("rechaza NaN e Infinity, que para JavaScript son números", () => {
    expect(validateSettingValue("identity.minor_profile_max_age", Number.NaN, "club").ok).toBe(false);
    expect(
      validateSettingValue("identity.minor_profile_max_age", Number.POSITIVE_INFINITY, "club").ok,
    ).toBe(false);
  });

  it("rechaza un valor fuera de la lista admitida", () => {
    expect(validateSettingValue("identity.waiver_renewal_policy", "anual", "club")).toEqual({
      ok: false,
      error: "valor_no_admitido",
    });
    expect(validateSettingValue("identity.waiver_renewal_policy", "on_text_change", "club").ok).toBe(
      true,
    );
  });

  it("rechaza fijar una clave de plataforma desde un club", () => {
    expect(validateSettingValue("auth.failed_login_lockout_minutes", 30, "club")).toEqual({
      ok: false,
      error: "ambito_demasiado_especifico",
    });
  });

  it("comprueba el ámbito ANTES que el tipo: son errores distintos y el orden importa", () => {
    // Con el tipo primero, un club que intenta cambiar una clave de plataforma con un valor mal
    // escrito recibiría «tipo inválido» y arreglaría el valor para volver a chocar contra el
    // mismo muro. El motivo real tiene que ser el primero que se dice.
    expect(validateSettingValue("auth.failed_login_lockout_minutes", "treinta", "club")).toEqual({
      ok: false,
      error: "ambito_demasiado_especifico",
    });
  });
});

describe("Lo que el catálogo declara sobre el estado real del sistema", () => {
  it("el cierre por inactividad está declarado como desactivado, no como un número inventado", () => {
    // `docs/08` lo deja «por definir» y `SessionGuard` (T-021) no mide inactividad: poner aquí un
    // número anunciaría un comportamiento que no existe.
    expect(settingDefinition("auth.session_idle_timeout_hours").default).toBeNull();
  });

  it("la política de waiver admite sólo lo que T-013 implementa", () => {
    expect(settingDefinition("identity.waiver_renewal_policy").allowed).toEqual(["on_text_change"]);
  });
});
