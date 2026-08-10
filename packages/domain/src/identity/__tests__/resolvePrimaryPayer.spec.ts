import { describe, expect, it } from "vitest";
import { resolvePrimaryPayer, type GuardianshipRef } from "../resolvePrimaryPayer.js";

const HOY = "2026-08-10";

const MADRE = "person-madre";
const PADRE = "person-padre";

function vinculo(parcial: Partial<GuardianshipRef> = {}): GuardianshipRef {
  return {
    guardianPersonId: MADRE,
    isPrimaryPayer: true,
    startsOn: "2026-01-01",
    endsOn: null,
    ...parcial,
  };
}

describe("resolvePrimaryPayer · hay exactamente uno vigente (R-010-10)", () => {
  it("un pagador principal sin fecha de fin responde por los cobros", () => {
    expect(resolvePrimaryPayer([vinculo()], HOY)).toEqual({ ok: true, value: MADRE });
  });

  it("ignora a los acudientes que no son pagador principal, aunque estén vigentes", () => {
    const guardianships = [
      vinculo({ guardianPersonId: PADRE, isPrimaryPayer: false }),
      vinculo({ guardianPersonId: MADRE, isPrimaryPayer: true }),
    ];

    expect(resolvePrimaryPayer(guardianships, HOY)).toEqual({ ok: true, value: MADRE });
  });

  it("el primer día de la ventana ya paga", () => {
    expect(resolvePrimaryPayer([vinculo({ startsOn: HOY })], HOY)).toEqual({
      ok: true,
      value: MADRE,
    });
  });

  it("el último día de la ventana todavía paga — el fin es inclusive", () => {
    expect(resolvePrimaryPayer([vinculo({ endsOn: HOY })], HOY)).toEqual({
      ok: true,
      value: MADRE,
    });
  });
});

describe("resolvePrimaryPayer · nadie vigente (riesgo declarado en spec §11)", () => {
  it("un menor sin ningún vínculo registrado no tiene a quién cobrarle", () => {
    expect(resolvePrimaryPayer([], HOY)).toEqual({ ok: false, error: "no_primary_payer" });
  });

  it("con acudientes vinculados pero ninguno marcado como pagador, falla explícitamente", () => {
    const guardianships = [
      vinculo({ guardianPersonId: MADRE, isPrimaryPayer: false }),
      vinculo({ guardianPersonId: PADRE, isPrimaryPayer: false }),
    ];

    expect(resolvePrimaryPayer(guardianships, HOY)).toEqual({
      ok: false,
      error: "no_primary_payer",
    });
  });

  it("un vínculo que terminó ayer ya no paga", () => {
    expect(resolvePrimaryPayer([vinculo({ endsOn: "2026-08-09" })], HOY)).toEqual({
      ok: false,
      error: "no_primary_payer",
    });
  });

  it("un vínculo que empieza mañana todavía no paga", () => {
    expect(resolvePrimaryPayer([vinculo({ startsOn: "2026-08-11" })], HOY)).toEqual({
      ok: false,
      error: "no_primary_payer",
    });
  });

  it("un vínculo de otro año no se cuela por comparar texto", () => {
    // "2026-08-10" vs "2025-12-31": si la comparación se hiciera mal, un vínculo cerrado el año
    // pasado podría parecer vigente. El formato con ceros lo impide.
    expect(resolvePrimaryPayer([vinculo({ endsOn: "2025-12-31" })], HOY)).toEqual({
      ok: false,
      error: "no_primary_payer",
    });
  });
});

describe("resolvePrimaryPayer · dos solapados: no se elige, se falla", () => {
  it("dos acudientes distintos vigentes a la vez son un dato roto, no un desempate", () => {
    const guardianships = [
      vinculo({ guardianPersonId: MADRE }),
      vinculo({ guardianPersonId: PADRE }),
    ];

    expect(resolvePrimaryPayer(guardianships, HOY)).toEqual({
      ok: false,
      error: "multiple_primary_payers",
    });
  });

  it("no devuelve el primero de la lista ni el más antiguo: el orden no cambia el resultado", () => {
    // Si alguien «arreglara» la ambigüedad eligiendo alguno, invertir la lista daría otra
    // respuesta. Aquí las dos órdenes fallan igual.
    const madrePrimero = [
      vinculo({ guardianPersonId: MADRE, startsOn: "2026-01-01" }),
      vinculo({ guardianPersonId: PADRE, startsOn: "2026-06-01" }),
    ];

    expect(resolvePrimaryPayer(madrePrimero, HOY)).toEqual(
      resolvePrimaryPayer([...madrePrimero].reverse(), HOY),
    );
    expect(resolvePrimaryPayer(madrePrimero, HOY).ok).toBe(false);
  });

  it("dos filas solapadas del MISMO acudiente sí se resuelven: no hay elección que hacer", () => {
    // Dato sucio (un vínculo duplicado), pero la plata va al mismo estado de cuenta de todos
    // modos. Bloquear a la familia por esto sería un castigo sin beneficio.
    const guardianships = [
      vinculo({ guardianPersonId: MADRE, startsOn: "2026-01-01" }),
      vinculo({ guardianPersonId: MADRE, startsOn: "2026-06-01" }),
    ];

    expect(resolvePrimaryPayer(guardianships, HOY)).toEqual({ ok: true, value: MADRE });
  });

  it("dos pagadores distintos pero uno ya vencido no es ambigüedad: paga el vigente", () => {
    const guardianships = [
      vinculo({ guardianPersonId: PADRE, startsOn: "2025-01-01", endsOn: "2026-05-31" }),
      vinculo({ guardianPersonId: MADRE, startsOn: "2026-06-01" }),
    ];

    expect(resolvePrimaryPayer(guardianships, HOY)).toEqual({ ok: true, value: MADRE });
  });
});
