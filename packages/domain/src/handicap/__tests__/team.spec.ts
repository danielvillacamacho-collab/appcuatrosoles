import { describe, expect, it } from "vitest";
import { handicapDelEquipo } from "../team.js";
import { validarHandicap, type HandicapHalves } from "../halves.js";

function equipo(...goles: number[]): HandicapHalves[] {
  return goles.map((valor) => {
    const resultado = validarHandicap(valor);

    if (!resultado.ok) {
      throw new Error(`El test usó un handicap inválido: ${valor}`);
    }

    return resultado.value;
  });
}

describe("handicapDelEquipo", () => {
  it("suma los cuatro jugadores, en medios goles", () => {
    // 1 + 2 + 0.5 + 3 goles = 6.5 goles = 13 medios.
    expect(handicapDelEquipo(equipo(2, 4, 1, 6))).toBe(13);
  });

  it("un equipo vacío vale 0", () => {
    expect(handicapDelEquipo([])).toBe(0);
  });

  it("los handicaps negativos restan de verdad", () => {
    // Dos principiantes de −2 y un jugador de 3: −2 −2 +3 = −1 gol.
    expect(handicapDelEquipo(equipo(-4, -4, 6))).toBe(-2);
  });

  it("el total PUEDE pasar de 20 medios: el rango acota a un jugador, no a un equipo", () => {
    // Cuatro de 10 goles son un equipo de 40 goles. Si el retorno fuera el tipo acotado, el primer
    // equipo fuerte haría fallar el cálculo.
    expect(handicapDelEquipo(equipo(20, 20, 20, 20))).toBe(80);
  });
});
