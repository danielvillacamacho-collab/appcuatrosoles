import { describe, expect, it } from "vitest";
import { planearCambioDeHandicap } from "../change.js";
import { validarHandicap, type HandicapHalves } from "../halves.js";

function halves(valor: number): HandicapHalves {
  const resultado = validarHandicap(valor);

  if (!resultado.ok) {
    throw new Error(`El test usó un handicap inválido: ${valor}`);
  }

  return resultado.value;
}

describe("planearCambioDeHandicap · el camino feliz", () => {
  it("subir medio gol devuelve el anterior y el nuevo", () => {
    const plan = planearCambioDeHandicap(halves(4), 5, "buen semestre, sube medio gol");

    expect(plan).toEqual({
      ok: true,
      value: { anterior: 4, nuevo: 5, motivo: "buen semestre, sube medio gol" },
    });
  });

  it("bajar también es un cambio válido", () => {
    expect(planearCambioDeHandicap(halves(6), 4, "lesión larga").ok).toBe(true);
  });

  it("el motivo se guarda sin espacios sobrantes", () => {
    const plan = planearCambioDeHandicap(halves(0), 1, "   sube   ");

    expect(plan.ok && plan.value.motivo).toBe("sube");
  });
});

describe("planearCambioDeHandicap · los cuatro rechazos, cada uno distinguible", () => {
  it("fuera del rango del polo", () => {
    expect(planearCambioDeHandicap(halves(4), 21, "porque sí")).toEqual({
      ok: false,
      error: { razon: "fuera_de_rango" },
    });
  });

  it("un decimal que no es medio gol", () => {
    expect(planearCambioDeHandicap(halves(4), 4.5, "porque sí")).toEqual({
      ok: false,
      error: { razon: "no_es_medio_gol" },
    });
  });

  it("sin motivo", () => {
    expect(planearCambioDeHandicap(halves(4), 5, "")).toEqual({
      ok: false,
      error: { razon: "sin_motivo" },
    });
  });

  it("un motivo de sólo espacios es un motivo ausente escrito de otra forma", () => {
    expect(planearCambioDeHandicap(halves(4), 5, "    ")).toEqual({
      ok: false,
      error: { razon: "sin_motivo" },
    });
  });

  it("el mismo valor que ya rige, y el rechazo dice cuál es", () => {
    // R-030-08: el que se olvida. Sin él, el historial se llena de filas idénticas.
    expect(planearCambioDeHandicap(halves(5), 5, "lo dejo igual")).toEqual({
      ok: false,
      error: { razon: "sin_cambio", actual: 5 },
    });
  });
});

describe("planearCambioDeHandicap · el orden de las comprobaciones", () => {
  it("un valor inválido gana sobre la falta de motivo: ni siquiera es un handicap", () => {
    expect(planearCambioDeHandicap(halves(4), 99, "")).toMatchObject({
      error: { razon: "fuera_de_rango" },
    });
  });

  it("«sin cambio» gana sobre «sin motivo»: escribir un motivo no lo salvaría", () => {
    // Si fuera al revés, el comisario redactaría un motivo para que lo rechacen igual.
    expect(planearCambioDeHandicap(halves(5), 5, "")).toMatchObject({
      error: { razon: "sin_cambio" },
    });
  });
});

describe("planearCambioDeHandicap · no sabe de roles, y es a propósito", () => {
  it("un cambio válido lo es sin importar quién lo pide", () => {
    // La autoridad la decide `hasPermission`. Son dos preguntas distintas, y mezclarlas obligaría
    // a este archivo a conocer los roles.
    expect(planearCambioDeHandicap(halves(-4), 20, "de principiante a 10 goles").ok).toBe(true);
  });
});
