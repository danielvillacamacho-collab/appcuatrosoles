import { describe, expect, it } from "vitest";
import { resolveSetting, type SettingValueRow } from "../resolveSetting.js";

const CLAVE = "identity.minor_profile_max_age";
const CLUB = "club-los-pinos";
const OTRO_CLUB = "club-ajeno";
const ORG = "org-cuatro-soles";
const OTRA_ORG = "org-ajena";

const HOY = new Date("2026-08-11T12:00:00.000Z");
const EL_AÑO_PASADO = new Date("2025-01-01T00:00:00.000Z");
const EN_MARZO = new Date("2026-03-01T00:00:00.000Z");
const EN_JUNIO = new Date("2026-06-01T00:00:00.000Z");
const EL_MES_QUE_VIENE = new Date("2026-09-01T00:00:00.000Z");

function fila(parcial: Partial<SettingValueRow> = {}): SettingValueRow {
  return {
    key: CLAVE,
    scope: "club",
    scopeId: CLUB,
    value: 18,
    effectiveFrom: EL_AÑO_PASADO,
    ...parcial,
  };
}

const DESDE_LA_ORG = { clubId: CLUB, organizationId: ORG };
const DESDE_EL_CLUB = { clubId: CLUB, organizationId: null };
const DESDE_LA_PLATAFORMA = { clubId: null, organizationId: null };

describe("resolveSetting · la cadena de herencia (R-020-10)", () => {
  it("sin ningún valor fijado, rige el default del catálogo", () => {
    expect(resolveSetting(CLAVE, [], DESDE_EL_CLUB, HOY)).toEqual({
      key: CLAVE,
      value: 18,
      source: "default",
      scope: null,
      effectiveFrom: null,
    });
  });

  it("un valor de plataforma se hereda en el club", () => {
    const filas = [fila({ scope: "platform", scopeId: null, value: 21 })];

    expect(resolveSetting(CLAVE, filas, DESDE_EL_CLUB, HOY)).toMatchObject({
      value: 21,
      source: "inherited",
      scope: "platform",
    });
  });

  it("el valor del club le gana al de la plataforma", () => {
    const filas = [
      fila({ scope: "platform", scopeId: null, value: 21 }),
      fila({ scope: "club", scopeId: CLUB, value: 16 }),
    ];

    expect(resolveSetting(CLAVE, filas, DESDE_EL_CLUB, HOY)).toMatchObject({
      value: 16,
      source: "explicit",
      scope: "club",
    });
  });

  it("el valor de la organización le gana al del club y al de la plataforma", () => {
    const filas = [
      fila({ scope: "platform", scopeId: null, value: 21 }),
      fila({ scope: "club", scopeId: CLUB, value: 16 }),
      fila({ scope: "organization", scopeId: ORG, value: 14 }),
    ];

    expect(resolveSetting(CLAVE, filas, DESDE_LA_ORG, HOY)).toMatchObject({
      value: 14,
      source: "explicit",
      scope: "organization",
    });
  });

  it("los cuatro niveles, vistos desde la organización", () => {
    const conTodo = [
      fila({ scope: "platform", scopeId: null, value: 21 }),
      fila({ scope: "club", scopeId: CLUB, value: 16 }),
      fila({ scope: "organization", scopeId: ORG, value: 14 }),
    ];

    expect(resolveSetting(CLAVE, conTodo, DESDE_LA_ORG, HOY).value).toBe(14);
    expect(resolveSetting(CLAVE, conTodo.slice(0, 2), DESDE_LA_ORG, HOY).value).toBe(16);
    expect(resolveSetting(CLAVE, conTodo.slice(0, 1), DESDE_LA_ORG, HOY).value).toBe(21);
    expect(resolveSetting(CLAVE, [], DESDE_LA_ORG, HOY).value).toBe(18);
  });
});

describe("resolveSetting · de dónde salió el valor (la mitad de HU-020-08)", () => {
  it("explícito es haberlo fijado en el ámbito por el que se pregunta", () => {
    const filas = [fila({ scope: "club", scopeId: CLUB, value: 16 })];

    expect(resolveSetting(CLAVE, filas, DESDE_EL_CLUB, HOY).source).toBe("explicit");
  });

  it("el mismo valor de club, visto desde la organización, está heredado", () => {
    // La respuesta depende de quién pregunta, no sólo de dónde está el dato: para el club es una
    // decisión suya; para la organización, algo que le viene dado y que puede querer cambiar.
    const filas = [fila({ scope: "club", scopeId: CLUB, value: 16 })];

    expect(resolveSetting(CLAVE, filas, DESDE_LA_ORG, HOY).source).toBe("inherited");
  });

  it("distingue «el club decidió 18» de «nadie decidió y 18 es lo que trae el sistema»", () => {
    // Son dos cosas distintas para quien administra: la primera se respeta, la segunda se revisa.
    const decidido = resolveSetting(CLAVE, [fila({ value: 18 })], DESDE_EL_CLUB, HOY);
    const heredadoDelSistema = resolveSetting(CLAVE, [], DESDE_EL_CLUB, HOY);

    expect(decidido.value).toBe(heredadoDelSistema.value);
    expect(decidido.source).toBe("explicit");
    expect(heredadoDelSistema.source).toBe("default");
  });
});

describe("resolveSetting · la historia (R-020-08)", () => {
  it("gana el más reciente que ya haya empezado a regir", () => {
    const filas = [
      fila({ value: 18, effectiveFrom: EL_AÑO_PASADO }),
      fila({ value: 16, effectiveFrom: EN_MARZO }),
      fila({ value: 17, effectiveFrom: EN_JUNIO }),
    ];

    expect(resolveSetting(CLAVE, filas, DESDE_EL_CLUB, HOY).value).toBe(17);
  });

  it("no depende del orden en que lleguen las filas: una consulta sin ORDER BY no promete ninguno", () => {
    const vieja = fila({ value: 18, effectiveFrom: EL_AÑO_PASADO });
    const intermedia = fila({ value: 16, effectiveFrom: EN_MARZO });
    const reciente = fila({ value: 17, effectiveFrom: EN_JUNIO });

    for (const orden of [
      [vieja, intermedia, reciente],
      [reciente, intermedia, vieja],
      [intermedia, reciente, vieja],
    ]) {
      expect(resolveSetting(CLAVE, orden, DESDE_EL_CLUB, HOY).value).toBe(17);
    }
  });

  it("un valor con vigencia futura todavía no rige", () => {
    const filas = [
      fila({ value: 18, effectiveFrom: EL_AÑO_PASADO }),
      fila({ value: 99, effectiveFrom: EL_MES_QUE_VIENE }),
    ];

    const resuelto = resolveSetting(CLAVE, filas, DESDE_EL_CLUB, HOY);

    expect(resuelto.value).toBe(18);
    expect(resuelto.effectiveFrom).toEqual(EL_AÑO_PASADO);
  });

  it("preguntar por una fecha pasada devuelve lo que regía entonces, no lo de hoy", () => {
    // Es lo que permite explicar un cobro viejo sin reconstruir nada: «en marzo regía 16».
    const filas = [
      fila({ value: 18, effectiveFrom: EL_AÑO_PASADO }),
      fila({ value: 16, effectiveFrom: EN_MARZO }),
      fila({ value: 17, effectiveFrom: EN_JUNIO }),
    ];

    expect(resolveSetting(CLAVE, filas, DESDE_EL_CLUB, new Date("2026-04-15T00:00:00.000Z")).value).toBe(16);
    expect(resolveSetting(CLAVE, filas, DESDE_EL_CLUB, new Date("2026-02-01T00:00:00.000Z")).value).toBe(18);
  });

  it("el instante exacto de vigencia ya cuenta: rige desde ese momento, no después", () => {
    const filas = [fila({ value: 16, effectiveFrom: EN_MARZO })];

    expect(resolveSetting(CLAVE, filas, DESDE_EL_CLUB, EN_MARZO).value).toBe(16);
    expect(
      resolveSetting(CLAVE, filas, DESDE_EL_CLUB, new Date(EN_MARZO.getTime() - 1)).source,
    ).toBe("default");
  });
});

describe("resolveSetting · aislamiento entre clubes y organizaciones (P-05)", () => {
  it("el valor de otro club no se ve desde aquí", () => {
    const filas = [fila({ scope: "club", scopeId: OTRO_CLUB, value: 99 })];

    expect(resolveSetting(CLAVE, filas, DESDE_EL_CLUB, HOY).source).toBe("default");
  });

  it("el valor de otra organización tampoco", () => {
    const filas = [fila({ scope: "organization", scopeId: OTRA_ORG, value: 99 })];

    expect(resolveSetting(CLAVE, filas, DESDE_LA_ORG, HOY).source).toBe("default");
  });

  it("ninguna combinación de valores ajenos consigue colarse", () => {
    const ajenos = [
      fila({ scope: "club", scopeId: OTRO_CLUB, value: 91 }),
      fila({ scope: "organization", scopeId: OTRA_ORG, value: 92 }),
      fila({ scope: "organization", scopeId: OTRA_ORG, value: 93, effectiveFrom: EN_JUNIO }),
    ];

    const resuelto = resolveSetting(CLAVE, ajenos, DESDE_LA_ORG, HOY);

    expect([91, 92, 93]).not.toContain(resuelto.value);
    expect(resuelto.source).toBe("default");
  });

  it("desde la plataforma no se ve el valor de ningún club", () => {
    const filas = [fila({ scope: "club", scopeId: CLUB, value: 16 })];

    expect(resolveSetting(CLAVE, filas, DESDE_LA_PLATAFORMA, HOY).source).toBe("default");
  });
});

describe("resolveSetting · sólo mira la clave que se le pidió", () => {
  it("ignora las filas de otras claves", () => {
    const filas = [
      fila({ key: "identity.waiver_renewal_policy", value: "on_text_change" }),
      fila({ key: "notifications.whatsapp_enabled", value: true }),
    ];

    expect(resolveSetting(CLAVE, filas, DESDE_EL_CLUB, HOY)).toMatchObject({
      value: 18,
      source: "default",
    });
  });

  it("devuelve el default nulo tal cual cuando el catálogo lo declara así", () => {
    // `auth.session_idle_timeout_hours` está en `null` a propósito (T-212): «desactivado». Quien
    // lo lea tiene que poder distinguirlo de un cero, que sería «cerrar de inmediato».
    expect(resolveSetting("auth.session_idle_timeout_hours", [], DESDE_LA_PLATAFORMA, HOY)).toMatchObject(
      { value: null, source: "default" },
    );
  });
});
