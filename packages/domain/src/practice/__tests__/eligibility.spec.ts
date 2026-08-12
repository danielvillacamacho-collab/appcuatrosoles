import { describe, expect, it } from "vitest";
import { puedePostularse } from "../eligibility.js";
import { validarHandicap, type HandicapHalves } from "../../handicap/halves.js";

function goles(valor: number): HandicapHalves {
  const medios = validarHandicap(valor * 2);

  if (!medios.ok) {
    throw new Error(`handicap inválido en el test: ${valor}`);
  }

  return medios.value;
}

const CUALQUIERA = { topeDeEstudiante: null };

describe("puedePostularse · el rango sugerido NO prohíbe (R-050-04)", () => {
  it("un jugador se postula a una práctica de cualquier nivel", () => {
    expect(puedePostularse(CUALQUIERA, { nivelMaximoHalves: goles(6) }).ok).toBe(true);
  });

  it("y también a una práctica sin nivel declarado", () => {
    expect(puedePostularse(CUALQUIERA, { nivelMaximoHalves: null }).ok).toBe(true);
  });
});

describe("puedePostularse · la habilitación del estudiante SÍ prohíbe (R-050-05)", () => {
  const estudiante = { topeDeEstudiante: goles(4) };

  it("no entra en una práctica de nivel superior al que le habilitaron", () => {
    expect(puedePostularse(estudiante, { nivelMaximoHalves: goles(6) })).toEqual({
      ok: false,
      error: "supera_su_habilitacion",
    });
  });

  it("sí entra en una de su mismo nivel: el borde es inclusivo", () => {
    // «Habilitado hasta prácticas de 4 goles» incluye las de 4.
    expect(puedePostularse(estudiante, { nivelMaximoHalves: goles(4) }).ok).toBe(true);
  });

  it("sí entra en una de nivel inferior", () => {
    expect(puedePostularse(estudiante, { nivelMaximoHalves: goles(2) }).ok).toBe(true);
  });

  it("FALLA CERRADO: sin nivel declarado no hay contra qué comparar, y no entra", () => {
    // Es incómodo a propósito. La alternativa es dejar entrar a un estudiante a algo que nadie
    // verificó, y de eso se sale lastimado.
    expect(puedePostularse(estudiante, { nivelMaximoHalves: null })).toEqual({
      ok: false,
      error: "practica_sin_nivel_declarado",
    });
  });

  it("las dos razones se distinguen: la pantalla tiene que poder decir cuál fue", () => {
    const porNivel = puedePostularse(estudiante, { nivelMaximoHalves: goles(8) });
    const porFaltaDeNivel = puedePostularse(estudiante, { nivelMaximoHalves: null });

    expect(porNivel.ok || porFaltaDeNivel.ok).toBe(false);
    expect(porNivel).not.toEqual(porFaltaDeNivel);
  });
});
