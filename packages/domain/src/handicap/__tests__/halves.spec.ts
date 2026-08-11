import { describe, expect, it } from "vitest";
import {
  goalsToHalves,
  halvesToGoals,
  HANDICAP_MAXIMO_HALVES,
  HANDICAP_MINIMO_HALVES,
  HANDICAP_POR_DEFECTO,
  validarHandicap,
  type HandicapHalves,
} from "../halves.js";

/** Atajo para los tests: fuera de aquí, el tipo sólo sale de `validarHandicap`. */
function halves(valor: number): HandicapHalves {
  const resultado = validarHandicap(valor);

  if (!resultado.ok) {
    throw new Error(`El test usó un handicap inválido: ${valor}`);
  }

  return resultado.value;
}

describe("validarHandicap · la única puerta de entrada al tipo", () => {
  it("acepta los dos extremos del polo", () => {
    expect(validarHandicap(HANDICAP_MINIMO_HALVES).ok).toBe(true);
    expect(validarHandicap(HANDICAP_MAXIMO_HALVES).ok).toBe(true);
  });

  it("rechaza justo afuera de cada extremo", () => {
    // Los bordes son donde se equivoca un `<` que debía ser `<=`.
    expect(validarHandicap(HANDICAP_MINIMO_HALVES - 1)).toEqual({
      ok: false,
      error: "fuera_de_rango",
    });
    expect(validarHandicap(HANDICAP_MAXIMO_HALVES + 1)).toEqual({
      ok: false,
      error: "fuera_de_rango",
    });
  });

  it("rechaza un decimal, con su razón propia", () => {
    // `1.5` aquí es casi siempre alguien que pasó goles donde iban medios goles.
    expect(validarHandicap(1.5)).toEqual({ ok: false, error: "no_es_medio_gol" });
    expect(validarHandicap(2.6)).toEqual({ ok: false, error: "no_es_medio_gol" });
  });

  it("rechaza NaN e Infinity como «no es medio gol», no como rango", () => {
    // No son enteros, así que caen en la primera comprobación. Lo que importa es que no pasen:
    // un `NaN` que atraviese llega a la base y desde ahí desequilibra todo lo que lo sume.
    expect(validarHandicap(Number.NaN).ok).toBe(false);
    expect(validarHandicap(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(validarHandicap(Number.NEGATIVE_INFINITY).ok).toBe(false);
  });

  it("las dos razones se distinguen: la interfaz tiene que poder explicar cuál falló", () => {
    expect(validarHandicap(1.3).ok === false && validarHandicap(1.3)).toMatchObject({
      error: "no_es_medio_gol",
    });
    expect(validarHandicap(21)).toMatchObject({ error: "fuera_de_rango" });
  });
});

describe("goalsToHalves · de goles a medios goles", () => {
  it("1.5 goles son 3 medios", () => {
    expect(goalsToHalves(1.5)).toEqual({ ok: true, value: 3 });
  });

  it("los dos extremos del polo: −2 y 10 goles", () => {
    expect(goalsToHalves(-2)).toEqual({ ok: true, value: -4 });
    expect(goalsToHalves(10)).toEqual({ ok: true, value: 20 });
  });

  it("NO redondea: 1.3 goles se rechaza en vez de volverse 2.5", () => {
    // Es el error que este módulo teme. Redondear dejaría al jugador con un handicap que nadie
    // eligió, sin que nada falle.
    expect(goalsToHalves(1.3)).toEqual({ ok: false, error: "no_es_medio_gol" });
    expect(goalsToHalves(0.25)).toEqual({ ok: false, error: "no_es_medio_gol" });
  });

  it("rechaza fuera del rango del polo", () => {
    expect(goalsToHalves(11)).toEqual({ ok: false, error: "fuera_de_rango" });
    expect(goalsToHalves(-3)).toEqual({ ok: false, error: "fuera_de_rango" });
  });
});

describe("ida y vuelta · ningún valor válido se pierde por el camino", () => {
  it("todo el rango sobrevive medios → goles → medios", () => {
    for (let valor = HANDICAP_MINIMO_HALVES; valor <= HANDICAP_MAXIMO_HALVES; valor += 1) {
      const goles = halvesToGoals(halves(valor));

      expect(goalsToHalves(goles)).toEqual({ ok: true, value: valor });
    }
  });

  it("los medios goles se ven como decimales exactos, sin coma flotante de por medio", () => {
    // Si esto fallara, un handicap 2.5 se mostraría como 2.4999999999999996.
    expect(halvesToGoals(halves(5))).toBe(2.5);
    expect(halvesToGoals(halves(-3))).toBe(-1.5);
    expect(halvesToGoals(halves(0))).toBe(0);
  });
});

describe("HANDICAP_POR_DEFECTO · −2 es un handicap real (R-030-05)", () => {
  it("vale lo mismo que un −2 puesto por el comisario", () => {
    // Deliberado: quien nunca fue calificado y quien fue calificado en −2 son indistinguibles por
    // el valor. Lo que los separa es el historial, y por eso ningún consumidor debe deducir
    // «no calificado» comparando contra esta constante.
    expect(HANDICAP_POR_DEFECTO).toBe(halves(-4));
  });

  it("es un valor válido, no un centinela", () => {
    expect(validarHandicap(HANDICAP_POR_DEFECTO).ok).toBe(true);
  });
});
