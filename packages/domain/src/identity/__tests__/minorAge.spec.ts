import { describe, expect, it } from "vitest";
import { cabeEnPerfilDeMenor, edadCumplida } from "../minorAge.js";

describe("edadCumplida", () => {
  it("cuenta años cumplidos, no años transcurridos", () => {
    expect(edadCumplida("2010-08-11", "2026-08-11")).toBe(16);
    expect(edadCumplida("2010-08-12", "2026-08-11")).toBe(15);
  });

  it("el día del cumpleaños ya cuenta", () => {
    // El borde importa: de él depende que un perfil de menor deje de serlo el día exacto.
    expect(edadCumplida("2008-08-11", "2026-08-11")).toBe(18);
    expect(edadCumplida("2008-08-11", "2026-08-10")).toBe(17);
  });

  it("no se equivoca con quien nació el 29 de febrero", () => {
    // `(hoy - nacimiento) / 365.25` da 8 años el 28 de febrero de un año no bisiesto. No los tiene.
    expect(edadCumplida("2016-02-29", "2024-02-28")).toBe(7);
    expect(edadCumplida("2016-02-29", "2024-03-01")).toBe(8);
  });

  it("el mismo día del nacimiento son cero años", () => {
    expect(edadCumplida("2026-08-11", "2026-08-11")).toBe(0);
  });

  it("una fecha futura no es edad cero: es un dato que no puede ser", () => {
    expect(edadCumplida("2027-01-01", "2026-08-11")).toBeNull();
  });
});

describe("cabeEnPerfilDeMenor", () => {
  it("cabe quien no ha llegado a la edad configurada", () => {
    expect(cabeEnPerfilDeMenor("2015-01-01", "2026-08-11", 18)).toBe(true);
  });

  it("no cabe quien la cumplió: ese día pasa a necesitar cuenta propia", () => {
    expect(cabeEnPerfilDeMenor("2008-08-11", "2026-08-11", 18)).toBe(false);
  });

  it("el límite es del club, no del código (P-04)", () => {
    // Un club puede querer 21 según cómo organice sus categorías, y ninguno debería necesitar un
    // despliegue para cambiarlo.
    const nacimiento = "2006-01-01";

    expect(cabeEnPerfilDeMenor(nacimiento, "2026-08-11", 18)).toBe(false);
    expect(cabeEnPerfilDeMenor(nacimiento, "2026-08-11", 21)).toBe(true);
  });

  it("una fecha de nacimiento futura no cabe en ningún perfil", () => {
    expect(cabeEnPerfilDeMenor("2030-01-01", "2026-08-11", 18)).toBe(false);
  });
});
