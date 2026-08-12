import { describe, expect, it } from "vitest";
import { validarParametrosDePractica, type ParametrosDePractica } from "../setup.js";

const BASE: ParametrosDePractica = {
  startsAt: new Date("2026-10-01T21:00:00Z"),
  endsAt: new Date("2026-10-01T23:00:00Z"),
  targetPlayers: 8,
  minPlayers: 6,
  applicationsCloseAt: new Date("2026-10-01T19:00:00Z"),
  decisionAt: new Date("2026-10-01T20:00:00Z"),
};

describe("validarParametrosDePractica", () => {
  it("una práctica normal pasa", () => {
    expect(validarParametrosDePractica(BASE).ok).toBe(true);
  });

  it("el mínimo puede ser igual al objetivo", () => {
    expect(validarParametrosDePractica({ ...BASE, minPlayers: 8 }).ok).toBe(true);
  });

  it("un mínimo mayor que el objetivo hace una práctica que nunca se confirma", () => {
    expect(validarParametrosDePractica({ ...BASE, minPlayers: 9 })).toEqual({
      ok: false,
      error: "minimo_mayor_que_objetivo",
    });
  });

  it("el cierre no puede ser posterior a la decisión (R-050-02)", () => {
    expect(
      validarParametrosDePractica({
        ...BASE,
        applicationsCloseAt: new Date("2026-10-01T20:30:00Z"),
      }),
    ).toEqual({ ok: false, error: "cierre_despues_de_decision" });
  });

  it("cierre y decisión a la misma hora sí se admite", () => {
    // «Se cierra y se decide en el mismo momento» es una configuración razonable.
    expect(
      validarParametrosDePractica({ ...BASE, applicationsCloseAt: BASE.decisionAt }).ok,
    ).toBe(true);
  });

  it("terminar antes de empezar se rechaza", () => {
    expect(
      validarParametrosDePractica({ ...BASE, endsAt: new Date("2026-10-01T20:00:00Z") }),
    ).toEqual({ ok: false, error: "rango_invalido" });
  });

  it("una práctica de duración cero se rechaza", () => {
    expect(validarParametrosDePractica({ ...BASE, endsAt: BASE.startsAt }).ok).toBe(false);
  });

  it("decidir después de que empezó no significa nada", () => {
    // No está en el spec: se agregó al implementar. Sin la regla, el club puede crear una práctica
    // que nunca se decide a tiempo y nada avisa.
    expect(
      validarParametrosDePractica({
        ...BASE,
        applicationsCloseAt: new Date("2026-10-01T21:30:00Z"),
        decisionAt: new Date("2026-10-01T22:00:00Z"),
      }),
    ).toEqual({ ok: false, error: "decision_despues_de_empezar" });
  });

  it("decidir justo cuando empieza sí se admite", () => {
    expect(
      validarParametrosDePractica({ ...BASE, decisionAt: BASE.startsAt }).ok,
    ).toBe(true);
  });
});
