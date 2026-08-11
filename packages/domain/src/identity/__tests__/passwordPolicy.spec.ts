import { describe, expect, it } from "vitest";
import { PASSWORDS_COMUNES, validatePassword } from "../passwordPolicy.js";

describe("validatePassword · lo que sirve (docs/06 §2)", () => {
  for (const valida of [
    "caballo7azul",
    "Practica2026",
    "mi-clave-larga-9",
    "8caracter",
    "una frase con 3 palabras",
  ]) {
    it(`acepta «${valida}»`, () => {
      expect(validatePassword(valida)).toEqual({ ok: true, value: undefined });
    });
  }

  it("acepta una frase larga sin símbolos ni mayúsculas", () => {
    // No se exigen símbolos ni mayúsculas a propósito: las reglas barrocas producen `Password1!`
    // en todas partes y una nota adhesiva en el monitor. Lo que protege es el largo.
    expect(validatePassword("el caballo tordillo del potrero 3").ok).toBe(true);
  });
});

describe("validatePassword · lo que no sirve, con su motivo", () => {
  const casos: { entrada: string; error: string; porque: string }[] = [
    { entrada: "abc123", error: "muy_corta", porque: "menos de ocho" },
    { entrada: "", error: "muy_corta", porque: "vacía" },
    { entrada: "abcdefgh", error: "sin_numeros", porque: "sólo letras" },
    { entrada: "12345678", error: "sin_letras", porque: "sólo números, y la regla más básica gana" },
    { entrada: "98765432", error: "sin_letras", porque: "sólo números" },
    { entrada: "password1", error: "demasiado_comun", porque: "está en la lista" },
    { entrada: "contrasena123", error: "demasiado_comun", porque: "la variante en español" },
  ];

  for (const caso of casos) {
    it(`rechaza «${caso.entrada}» — ${caso.porque}`, () => {
      expect(validatePassword(caso.entrada)).toEqual({ ok: false, error: caso.error });
    });
  }

  it("rechaza una contraseña absurdamente larga: hashear un megabyte es un ataque barato", () => {
    expect(validatePassword("a1".repeat(200))).toEqual({ ok: false, error: "muy_larga" });
  });

  it("no distingue mayúsculas al buscar en la lista de comunes", () => {
    expect(validatePassword("Password1")).toEqual({ ok: false, error: "demasiado_comun" });
    expect(validatePassword("PASSWORD123")).toEqual({ ok: false, error: "demasiado_comun" });
  });
});

describe("validatePassword · la contraseña no puede contener el correo", () => {
  it("rechaza la parte local del correo", () => {
    // `maria@lospinos.co` con `maria123` cumple todo lo demás, y es lo primero que prueba
    // cualquiera que vea la lista de socios del club.
    expect(validatePassword("maria123", "maria@lospinos.co")).toEqual({
      ok: false,
      error: "contiene_el_correo",
    });
  });

  it("rechaza el correo completo", () => {
    expect(validatePassword("maria@lospinos.co1", "maria@lospinos.co")).toEqual({
      ok: false,
      error: "contiene_el_correo",
    });
  });

  it("no distingue mayúsculas", () => {
    expect(validatePassword("MARIA123", "maria@lospinos.co").ok).toBe(false);
  });

  it("una parte local de dos letras no descalifica: la contendría cualquier contraseña", () => {
    expect(validatePassword("caballo7azul", "jo@lospinos.co").ok).toBe(true);
  });

  it("sin correo, la regla no aplica — hay flujos que todavía no lo conocen", () => {
    expect(validatePassword("maria123").ok).toBe(true);
  });

  it("con un correo vacío tampoco: si no, cualquier contraseña «contendría» la cadena vacía", () => {
    expect(validatePassword("caballo7azul", "").ok).toBe(true);
    expect(validatePassword("caballo7azul", "   ").ok).toBe(true);
  });
});

describe("validatePassword · el orden de los motivos", () => {
  it("informa el problema más básico primero", () => {
    // Una contraseña corta Y común se reporta como corta: pedirle a alguien que arregle lo
    // segundo cuando lo primero también falla lo obliga a adivinar dos veces.
    expect(validatePassword("abc1")).toEqual({ ok: false, error: "muy_corta" });
  });
});

describe("La lista de comunes", () => {
  it("no está vacía y todas sus entradas están en minúsculas", () => {
    expect(PASSWORDS_COMUNES.size).toBeGreaterThan(20);
    expect([...PASSWORDS_COMUNES].filter((c) => c !== c.toLowerCase())).toEqual([]);
  });

  it("ninguna entrada es más corta que el mínimo: sería ocupar lugar sin proteger de nada", () => {
    // Una contraseña de menos de ocho caracteres ya la rechaza el largo. Tenerla también aquí haría
    // creer que la lista cubre algo que en realidad cubría otra regla.
    const inutiles = [...PASSWORDS_COMUNES].filter((comun) => comun.length < 8);

    expect(inutiles).toEqual([]);
  });
});
