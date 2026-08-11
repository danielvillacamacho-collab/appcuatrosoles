import { describe, expect, it } from "vitest";
import { normalizeSlug, validateSlug, SLUG_RESERVADOS } from "../slug.js";

describe("validateSlug · lo que sirve como subdominio de un club (R-020-03)", () => {
  for (const valido of ["lospinos", "los-pinos", "club2026", "ab", "a-b-c", "x1"]) {
    it(`acepta «${valido}»`, () => {
      expect(validateSlug(valido)).toEqual({ ok: true, value: valido });
    });
  }

  it("acepta el largo máximo de una etiqueta de host (63) y rechaza uno más", () => {
    expect(validateSlug("a".repeat(63)).ok).toBe(true);
    expect(validateSlug("a".repeat(64))).toEqual({ ok: false, error: "slug_muy_largo" });
  });
});

describe("validateSlug · lo que no sirve, y por qué se distingue el motivo", () => {
  const casos: { entrada: string; error: string; porque: string }[] = [
    { entrada: "", error: "slug_vacio", porque: "no hay nada que validar" },
    { entrada: "   ", error: "slug_vacio", porque: "sólo espacios es lo mismo que vacío" },
    { entrada: "a", error: "slug_muy_corto", porque: "una letra sola invita a colisiones" },
    { entrada: "los pinos", error: "slug_formato_invalido", porque: "el espacio no vale en un host" },
    { entrada: "los.pinos", error: "slug_formato_invalido", porque: "el punto es otro nivel de subdominio" },
    { entrada: "los_pinos", error: "slug_formato_invalido", porque: "el guion bajo no vale en un host" },
    { entrada: "-lospinos", error: "slug_formato_invalido", porque: "no puede empezar con guion" },
    { entrada: "lospinos-", error: "slug_formato_invalido", porque: "no puede terminar con guion" },
    { entrada: "los@pinos", error: "slug_formato_invalido", porque: "ningún símbolo" },
    { entrada: "lospinós", error: "slug_formato_invalido", porque: "sin acentos: el DNS no los admite" },
  ];

  for (const caso of casos) {
    it(`rechaza «${caso.entrada}» — ${caso.porque}`, () => {
      expect(validateSlug(caso.entrada)).toEqual({ ok: false, error: caso.error });
    });
  }

  it("distingue «muy corto» de «formato inválido»: son mensajes distintos para el usuario", () => {
    expect(validateSlug("a").ok).toBe(false);
    expect(validateSlug("a")).not.toEqual(validateSlug("a b"));
  });
});

describe("validateSlug · normaliza lo que no cambia el significado, y nada más", () => {
  it("recorta espacios alrededor y baja a minúsculas", () => {
    expect(validateSlug("  LosPinos  ")).toEqual({ ok: true, value: "lospinos" });
  });

  it("no convierte «Los Pinos» en «los-pinos» por su cuenta", () => {
    // Arreglarlo en silencio parece amable hasta que el club descubre que su dirección —la que va
    // impresa en el correo de invitación de todos sus socios— no es la que creyó elegir.
    expect(validateSlug("Los Pinos")).toEqual({ ok: false, error: "slug_formato_invalido" });
  });

  it("normalizeSlug no valida: sólo normaliza", () => {
    expect(normalizeSlug("  ¡HOLA!  ")).toBe("¡hola!");
  });
});

describe("validateSlug · nombres reservados", () => {
  for (const reservado of ["www", "api", "admin", "app", "localhost"]) {
    it(`rechaza «${reservado}»: ya significa otra cosa`, () => {
      // El caso feo no es que falle, es que **funcione**: un club en `www` o en `api` queda
      // accesible desde una dirección que el resto del sistema espera que sea otra cosa.
      expect(validateSlug(reservado)).toEqual({ ok: false, error: "slug_reservado" });
    });
  }

  it("los reservados se rechazan sin importar cómo se escriban", () => {
    expect(validateSlug("  WWW ")).toEqual({ ok: false, error: "slug_reservado" });
  });

  it("la lista se mantiene corta: cada nombre reservado es uno que un cliente real no puede usar", () => {
    expect(SLUG_RESERVADOS.size).toBeLessThanOrEqual(12);
  });

  it("un reservado con algo alrededor sí es válido: la reserva es exacta, no por parecido", () => {
    expect(validateSlug("api-polo").ok).toBe(true);
    expect(validateSlug("mi-app").ok).toBe(true);
  });
});
