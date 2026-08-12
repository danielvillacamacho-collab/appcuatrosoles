import { describe, expect, it } from "vitest";
import { armarPuestos, posicionDe, repartirCupos, type Postulacion } from "../slots.js";

/** `t` son minutos desde un origen fijo: la fila es el orden de llegada, nada más. */
function postulacion(personId: string, t: number, pareja: string | null = null): Postulacion {
  return {
    id: `app-${String(t).padStart(3, "0")}-${personId}`,
    personId,
    appliedAt: new Date(Date.UTC(2026, 8, 1, 10, t)),
    chukkersOffered: 4,
    halfManPartnerPersonId: pareja,
  };
}

const nombres = (puestos: readonly { titular: Postulacion; companero: Postulacion | null }[]): string[] =>
  puestos.map((puesto) =>
    puesto.companero === null
      ? puesto.titular.personId
      : `${puesto.titular.personId}+${puesto.companero.personId}`,
  );

describe("armarPuestos · las parejas son recíprocas o no son (R-050-08)", () => {
  it("dos que se nombran mutuamente ocupan UN puesto", () => {
    const puestos = armarPuestos([postulacion("ana", 1, "beto"), postulacion("beto", 2, "ana")]);

    expect(puestos).toHaveLength(1);
    expect(nombres(puestos)).toEqual(["ana+beto"]);
  });

  it("una propuesta sin respuesta deja a los dos como puestos sueltos", () => {
    // Si bastara con nombrar a alguien, cualquiera podría reservarle un lugar a un tercero que no
    // se enteró.
    const puestos = armarPuestos([postulacion("ana", 1, "beto"), postulacion("beto", 2, null)]);

    expect(nombres(puestos)).toEqual(["ana", "beto"]);
  });

  it("proponerle a quien no se postuló no forma nada", () => {
    const puestos = armarPuestos([postulacion("ana", 1, "fantasma")]);

    expect(nombres(puestos)).toEqual(["ana"]);
  });

  it("el triángulo NO forma pareja: A→B, B→C", () => {
    // Es el caso que se olvida, y el que produce cupos fantasma si se mira un solo lado.
    const puestos = armarPuestos([
      postulacion("ana", 1, "beto"),
      postulacion("beto", 2, "caro"),
      postulacion("caro", 3, null),
    ]);

    expect(nombres(puestos)).toEqual(["ana", "beto", "caro"]);
  });

  it("dos parejas conviven sin mezclarse", () => {
    const puestos = armarPuestos([
      postulacion("ana", 1, "beto"),
      postulacion("beto", 2, "ana"),
      postulacion("caro", 3, "dani"),
      postulacion("dani", 4, "caro"),
    ]);

    expect(nombres(puestos)).toEqual(["ana+beto", "caro+dani"]);
  });

  it("el titular es quien llegó primero, no quien propuso", () => {
    const puestos = armarPuestos([postulacion("beto", 5, "ana"), postulacion("ana", 1, "beto")]);

    expect(nombres(puestos)).toEqual(["ana+beto"]);
  });

  it("nadie aparece en dos puestos", () => {
    const puestos = armarPuestos([
      postulacion("ana", 1, "beto"),
      postulacion("beto", 2, "ana"),
      postulacion("caro", 3, null),
    ]);
    const personas = puestos.flatMap((puesto) =>
      [puesto.titular.personId, puesto.companero?.personId].filter(Boolean),
    );

    expect(new Set(personas).size).toBe(personas.length);
  });

  it("dos que se postulan en el MISMO milisegundo tienen un titular estable", () => {
    // El desempate también hace falta al armar la pareja, no sólo al ordenar la fila: si el titular
    // cambiara entre lecturas, la posición del puesto cambiaría con él.
    const ana = { ...postulacion("ana", 7, "beto"), id: "app-aaa" };
    const beto = { ...postulacion("beto", 7, "ana"), id: "app-bbb" };

    expect(nombres(armarPuestos([ana, beto]))).toEqual(["ana+beto"]);
    expect(nombres(armarPuestos([beto, ana]))).toEqual(["ana+beto"]);
  });

  it("sin postulaciones no hay puestos", () => {
    expect(armarPuestos([])).toEqual([]);
  });
});

describe("repartirCupos · por orden de llegada (R-050-06)", () => {
  const fila = [
    postulacion("uno", 1),
    postulacion("dos", 2),
    postulacion("tres", 3),
    postulacion("cuatro", 4),
    postulacion("cinco", 5),
  ].map((una) => ({ titular: una, companero: null }));

  it("entran los primeros, el resto espera", () => {
    const reparto = repartirCupos(fila, 3);

    expect(nombres(reparto.dentro)).toEqual(["uno", "dos", "tres"]);
    expect(nombres(reparto.enEspera)).toEqual(["cuatro", "cinco"]);
  });

  it("si sobran cupos, entran todos y la espera va vacía", () => {
    const reparto = repartirCupos(fila, 10);

    expect(reparto.dentro).toHaveLength(5);
    expect(reparto.enEspera).toEqual([]);
  });

  it("el orden de entrada no depende del orden en que lleguen los datos", () => {
    const desordenada = [fila[3], fila[0], fila[4], fila[1], fila[2]].filter(
      (puesto): puesto is (typeof fila)[number] => puesto !== undefined,
    );

    expect(nombres(repartirCupos(desordenada, 3).dentro)).toEqual(["uno", "dos", "tres"]);
  });

  it("dos postulaciones en el MISMO milisegundo dan siempre el mismo corte", () => {
    // Sin desempate estable, la misma persona vería «estás dentro» y «estás en espera» en dos
    // pantallazos seguidos. Los identificadores son uuid v7 y crecen con el tiempo.
    const a = { titular: { ...postulacion("ana", 7), id: "app-aaa" }, companero: null };
    const b = { titular: { ...postulacion("beto", 7), id: "app-bbb" }, companero: null };

    expect(nombres(repartirCupos([a, b], 1).dentro)).toEqual(["ana"]);
    expect(nombres(repartirCupos([b, a], 1).dentro)).toEqual(["ana"]);
  });

  it("retirarse promueve al siguiente sin que corra nada", () => {
    // La propiedad por la que el reparto se calcula en vez de guardarse (`plan.md` §0.1).
    const sinElSegundo = fila.filter((puesto) => puesto.titular.personId !== "dos");

    expect(nombres(repartirCupos(sinElSegundo, 3).dentro)).toEqual(["uno", "tres", "cuatro"]);
  });

  it("formar una pareja acorta la fila y mete a alguien de la espera", () => {
    // Dos puestos sueltos que se emparejan pasan a ser uno: nadie se corre hacia atrás.
    const sueltas = armarPuestos([
      postulacion("uno", 1),
      postulacion("dos", 2),
      postulacion("tres", 3),
    ]);
    const emparejadas = armarPuestos([
      postulacion("uno", 1, "dos"),
      postulacion("dos", 2, "uno"),
      postulacion("tres", 3),
    ]);

    expect(nombres(repartirCupos(sueltas, 2).enEspera)).toEqual(["tres"]);
    expect(nombres(repartirCupos(emparejadas, 2).enEspera)).toEqual([]);
  });

  it("cero cupos deja a todos en espera, y un número negativo no rompe nada", () => {
    expect(repartirCupos(fila, 0).dentro).toEqual([]);
    expect(repartirCupos(fila, -3).enEspera).toHaveLength(5);
  });
});

describe("posicionDe · dónde quedé yo", () => {
  const reparto = repartirCupos(
    armarPuestos([
      postulacion("uno", 1),
      postulacion("dos", 2, "tres"),
      postulacion("tres", 3, "dos"),
      postulacion("cuatro", 4),
      postulacion("cinco", 5),
    ]),
    2,
  );

  it("quien está dentro sabe en qué puesto", () => {
    expect(posicionDe("uno", reparto)).toEqual({ estado: "dentro", posicion: 1 });
  });

  it("los dos de una pareja comparten la misma posición", () => {
    expect(posicionDe("dos", reparto)).toEqual({ estado: "dentro", posicion: 2 });
    expect(posicionDe("tres", reparto)).toEqual({ estado: "dentro", posicion: 2 });
  });

  it("la espera se cuenta desde 1: «sos el segundo de la lista», no «el noveno»", () => {
    expect(posicionDe("cuatro", reparto)).toEqual({ estado: "en_espera", posicion: 1 });
    expect(posicionDe("cinco", reparto)).toEqual({ estado: "en_espera", posicion: 2 });
  });

  it("quien no se postuló no está en ninguna parte", () => {
    expect(posicionDe("ajena", reparto)).toBeNull();
  });
});
