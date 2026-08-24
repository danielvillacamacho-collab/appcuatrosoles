import { describe, expect, it } from "vitest";
import { balancearEquipos, handicapDelPuesto, type PuestoAsignable } from "../balance.js";
import { validarHandicap, type HandicapHalves } from "../../handicap/halves.js";

function medios(valor: number): HandicapHalves {
  const validado = validarHandicap(valor);

  if (!validado.ok) {
    throw new Error(`handicap inválido en el test: ${valor}`);
  }

  return validado.value;
}

/** Puestos con nombres cortos, para que el reparto se lea. */
function puestos(...pesos: number[]): PuestoAsignable[] {
  return pesos.map((peso, i) => ({
    id: String.fromCharCode(97 + i),
    handicapHalves: medios(peso),
  }));
}

const sumaDe = (ids: readonly string[], todos: PuestoAsignable[]): number =>
  ids.reduce((suma, id) => suma + (todos.find((p) => p.id === id)?.handicapHalves ?? 0), 0);

describe("handicapDelPuesto · la regla del medio hombre (R-051-06)", () => {
  it("un puesto de una sola persona pesa lo suyo", () => {
    expect(handicapDelPuesto(medios(4), null)).toBe(4);
  });

  it("compartido entre 2 y 4 goles, pesa 4 — ni la suma ni el promedio", () => {
    // El ejemplo del documento fuente. En la cancha ese puesto rinde como el mejor de los dos.
    expect(handicapDelPuesto(medios(4), medios(8))).toBe(8);
  });

  it("y da igual cuál de los dos sea el titular", () => {
    expect(handicapDelPuesto(medios(8), medios(4))).toBe(8);
  });

  it("dos iguales pesan ese valor", () => {
    expect(handicapDelPuesto(medios(6), medios(6))).toBe(6);
  });

  it("funciona con handicaps negativos, que son handicaps de verdad", () => {
    expect(handicapDelPuesto(medios(-4), medios(-2))).toBe(-2);
  });
});

describe("balancearEquipos · el reparto es EXACTO, no razonable", () => {
  it("el caso donde el codicioso falla y el exacto acierta", () => {
    // Con [8,7,6,5,4] el codicioso —el más fuerte al equipo más liviano— reparte 8,5,4 contra 7,6
    // y deja diferencia 4. El exacto encuentra 8,7 contra 6,5,4: diferencia 0.
    //
    // **Sin este caso el error pasaría**: cualquier reparto se ve razonable si uno no compara.
    const cinco = puestos(8, 7, 6, 5, 4);
    const reparto = balancearEquipos(cinco);

    expect(reparto.diferenciaHalves).toBe(0);
  });

  it("reparte ocho puestos dejando la diferencia mínima", () => {
    const ocho = puestos(20, 18, 14, 12, 10, 8, 6, 4);
    const reparto = balancearEquipos(ocho);

    expect(reparto.diferenciaHalves).toBe(0);
    expect(reparto.equipoA).toHaveLength(4);
    expect(reparto.equipoB).toHaveLength(4);
  });

  it("cuando no existe reparto perfecto, da el mejor que hay", () => {
    // 1 y 2: la diferencia mínima posible es 1, y no hay forma de bajarla.
    const dos = puestos(2, 4);

    expect(balancearEquipos(dos).diferenciaHalves).toBe(2);
  });

  it("la diferencia que informa es la de verdad", () => {
    const siete = puestos(20, 16, 12, 10, 8, 6, 2);
    const reparto = balancearEquipos(siete);
    const diferencia = Math.abs(sumaDe(reparto.equipoA, siete) - sumaDe(reparto.equipoB, siete));

    expect(reparto.diferenciaHalves).toBe(diferencia);
  });
});

describe("balancearEquipos · determinismo (R-051-04)", () => {
  it("el mismo conjunto DESORDENADO da el mismo reparto", () => {
    // Es lo que permite explicarlo: dos personas mirando los mismos handicaps llegan a lo mismo.
    const enUnOrden = puestos(12, 8, 6, 10, 4, 14);
    const enOtro = [...enUnOrden].reverse();

    const uno = balancearEquipos(enUnOrden);
    const otro = balancearEquipos(enOtro);

    expect([...uno.equipoA].sort()).toEqual([...otro.equipoA].sort());
    expect([...uno.equipoB].sort()).toEqual([...otro.equipoB].sort());
  });

  it("repetirlo mil veces da siempre lo mismo", () => {
    const ocho = puestos(20, 18, 14, 12, 10, 8, 6, 4);
    const primero = JSON.stringify(balancearEquipos(ocho));

    for (let i = 0; i < 1000; i += 1) {
      expect(JSON.stringify(balancearEquipos(ocho))).toBe(primero);
    }
  });
});

describe("balancearEquipos · tamaños y bordes (R-051-03)", () => {
  it("con número impar, los equipos quedan con un puesto de diferencia", () => {
    const cinco = balancearEquipos(puestos(8, 7, 6, 5, 4));

    expect(Math.abs(cinco.equipoA.length - cinco.equipoB.length)).toBe(1);
  });

  it("nadie queda afuera y nadie está en los dos", () => {
    const nueve = puestos(20, 18, 16, 14, 12, 10, 8, 6, 4);
    const reparto = balancearEquipos(nueve);
    const todos = [...reparto.equipoA, ...reparto.equipoB];

    expect(todos).toHaveLength(9);
    expect(new Set(todos).size).toBe(9);
  });

  it("sin puestos, dos equipos vacíos", () => {
    expect(balancearEquipos([])).toEqual({ equipoA: [], equipoB: [], diferenciaHalves: 0 });
  });

  it("con un solo puesto, va a un equipo y el otro queda vacío", () => {
    const uno = balancearEquipos(puestos(6));

    expect(uno.equipoA).toHaveLength(1);
    expect(uno.equipoB).toHaveLength(0);
    expect(uno.diferenciaHalves).toBe(6);
  });

  it("con handicaps NEGATIVOS reparte igual de bien", () => {
    // −2 goles es `-4` medios y es un handicap real: un club con principiantes es el caso normal,
    // no el raro. Una tabla indexada por suma no admite índices negativos, así que si el
    // desplazamiento estuviera mal, esto rompería justo donde más falta hace.
    const conPrincipiantes = puestos(-4, -4, -2, -2, 4, 4);

    expect(balancearEquipos(conPrincipiantes).diferenciaHalves).toBe(0);
  });

  it("todos iguales quedan perfectamente repartidos", () => {
    expect(balancearEquipos(puestos(6, 6, 6, 6)).diferenciaHalves).toBe(0);
  });
});

describe("balancearEquipos · el peor caso que permite el contrato", () => {
  it("40 puestos de 10 goles se reparten sin demora", () => {
    const cuarenta = puestos(...Array.from({ length: 40 }, () => 20));
    const antes = performance.now();
    const reparto = balancearEquipos(cuarenta);
    const tardo = performance.now() - antes;

    expect(reparto.diferenciaHalves).toBe(0);
    expect(tardo).toBeLessThan(1000);
  });
});
