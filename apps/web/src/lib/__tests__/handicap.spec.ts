import { describe, expect, it } from "vitest";
import { golesAMediosGoles, handicapEnGoles } from "../handicap.js";

describe("handicapEnGoles · cómo se lee un handicap en es-CO", () => {
  it("los medios goles se escriben con coma", () => {
    expect(handicapEnGoles(3)).toBe("1,5");
    expect(handicapEnGoles(5)).toBe("2,5");
  });

  it("los enteros no arrastran decimales", () => {
    expect(handicapEnGoles(4)).toBe("2");
    expect(handicapEnGoles(0)).toBe("0");
  });

  it("los negativos llevan el signo menos de verdad, no un guión", () => {
    // En «−2» un guión se lee como separador. El carácter es U+2212.
    expect(handicapEnGoles(-4)).toBe("−2");
    expect(handicapEnGoles(-3)).toBe("−1,5");
  });
});

describe("golesAMediosGoles · lo que escribe el comisario", () => {
  it("acepta coma y punto: la gente escribe las dos", () => {
    expect(golesAMediosGoles("2,5")).toBe(5);
    expect(golesAMediosGoles("2.5")).toBe(5);
  });

  it("acepta enteros y negativos", () => {
    expect(golesAMediosGoles("3")).toBe(6);
    expect(golesAMediosGoles("-2")).toBe(-4);
    expect(golesAMediosGoles("−2")).toBe(-4);
  });

  it("NO redondea: 2,3 se rechaza en vez de volverse 2,5", () => {
    // Mismo criterio que `goalsToHalves` en el dominio: redondear dejaría al jugador con un valor
    // que nadie eligió.
    expect(golesAMediosGoles("2,3")).toBeNull();
    expect(golesAMediosGoles("0,25")).toBeNull();
  });

  it("rechaza lo que no es un número", () => {
    expect(golesAMediosGoles("")).toBeNull();
    expect(golesAMediosGoles("   ")).toBeNull();
    expect(golesAMediosGoles("dos")).toBeNull();
  });

  it("ida y vuelta con lo que muestra la pantalla", () => {
    for (const medios of [-4, -3, 0, 3, 5, 20]) {
      expect(golesAMediosGoles(handicapEnGoles(medios))).toBe(medios);
    }
  });
});
