import { describe, expect, it } from "vitest";
import {
  chukkersPorPersona,
  grillaInicial,
  puedeCerrar,
  validarGrilla,
  type Celda,
  type PuestoDeGrilla,
} from "../grid.js";

const OCHO_PUESTOS: PuestoDeGrilla[] = [
  { equipo: "A", position: 1, personId: "a1" },
  { equipo: "A", position: 2, personId: "a2" },
  { equipo: "A", position: 3, personId: "a3" },
  { equipo: "A", position: 4, personId: "a4" },
  { equipo: "B", position: 1, personId: "b1" },
  { equipo: "B", position: 2, personId: "b2" },
  { equipo: "B", position: 3, personId: "b3" },
  { equipo: "B", position: 4, personId: "b4" },
];

function celda(chukker: number, personId: string | null, equipo: "A" | "B" = "A", position = 1): Celda {
  return { chukker, equipo, position, personId };
}

describe("grillaInicial (T-701)", () => {
  it("8 puestos y 6 chukkers dan 48 celdas, sin repetir ningún lugar", () => {
    const celdas = grillaInicial(OCHO_PUESTOS, 6);

    expect(celdas).toHaveLength(48);

    const lugares = new Set(celdas.map((c) => `${c.chukker}:${c.equipo}:${c.position}`));
    expect(lugares.size, "cada lugar de la grilla existe una sola vez").toBe(48);
  });

  it("todos juegan todos los chukkers: es lo que pasa en una práctica normal", () => {
    const celdas = grillaInicial(OCHO_PUESTOS, 6);

    for (const puesto of OCHO_PUESTOS) {
      const suyas = celdas.filter((c) => c.personId === puesto.personId);
      expect(suyas.map((c) => c.chukker).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it("un puesto compartido nace a nombre del TITULAR, no repartido entre los dos", () => {
    // El medio hombre: quién de los dos entra en cada chukker es lo que el comisario va a corregir.
    // Repartir las celdas por la mitad inventaría un dato con apariencia de hecho.
    const celdas = grillaInicial([{ equipo: "A", position: 1, personId: "titular" }], 6);

    expect(celdas.every((c) => c.personId === "titular")).toBe(true);
  });

  it("sirve para 6, 7 y 8 chukkers", () => {
    for (const chukkers of [6, 7, 8]) {
      expect(grillaInicial(OCHO_PUESTOS, chukkers)).toHaveLength(8 * chukkers);
    }
  });

  it("sin puestos devuelve vacío en vez de romper", () => {
    expect(grillaInicial([], 6)).toEqual([]);
  });
});

describe("chukkersPorPersona (T-702)", () => {
  it("quien está en seis celdas cuenta seis", () => {
    const cuenta = chukkersPorPersona(grillaInicial(OCHO_PUESTOS, 6));

    expect(cuenta.get("a1")).toBe(6);
    expect(cuenta.size).toBe(8);
  });

  it("las celdas vacías NO cuentan para nadie", () => {
    const cuenta = chukkersPorPersona([celda(1, "ana"), celda(2, null), celda(3, null)]);

    expect(cuenta.get("ana")).toBe(1);
    expect(cuenta.size, "un hueco no crea una persona").toBe(1);
  });

  it("un puesto compartido reparte según quién esté en cada celda, no mitad y mitad", () => {
    // Ana jugó cuatro y su medio hombre dos. La grilla lo dice; no hay ninguna regla que lo divida.
    const celdas = [
      celda(1, "ana"),
      celda(2, "ana"),
      celda(3, "ana"),
      celda(4, "ana"),
      celda(5, "companero"),
      celda(6, "companero"),
    ];

    const cuenta = chukkersPorPersona(celdas);

    expect(cuenta.get("ana")).toBe(4);
    expect(cuenta.get("companero")).toBe(2);
  });

  it("quien no jugó NO aparece, que es distinto de aparecer en cero", () => {
    // «No jugó» y «no estaba» son cosas distintas, y el cobro de Fase 3 va a necesitar la
    // diferencia. Un cero inventado las confunde.
    const cuenta = chukkersPorPersona([celda(1, "ana")]);

    expect(cuenta.has("luis")).toBe(false);
    expect(cuenta.get("luis")).toBeUndefined();
  });

  it("una grilla vacía no cuenta a nadie", () => {
    expect(chukkersPorPersona([]).size).toBe(0);
  });
});

describe("validarGrilla (T-703)", () => {
  it("la misma persona dos veces en el mismo chukker se rechaza", () => {
    const resultado = validarGrilla([celda(4, "ana", "A", 1), celda(4, "ana", "A", 2)]);

    expect(resultado.ok).toBe(false);
  });

  it("se rechaza AUNQUE sea en equipos distintos: es el caso que de verdad ocurre", () => {
    // Sustituir a alguien y olvidar sacarlo de donde estaba. Mirando equipo por equipo se escapa.
    const resultado = validarGrilla([celda(4, "ana", "A", 1), celda(4, "ana", "B", 3)]);

    expect(resultado.ok).toBe(false);
  });

  it("el rechazo dice QUIÉN y EN QUÉ CHUKKER", () => {
    // Sin esto habría que buscar a mano en una matriz de 64 celdas.
    const resultado = validarGrilla([celda(4, "ana", "A", 1), celda(4, "ana", "B", 3)]);

    if (resultado.ok) {
      throw new Error("se esperaba un rechazo");
    }

    expect(resultado.error).toEqual({
      motivo: "repetido_en_el_chukker",
      personId: "ana",
      chukker: 4,
    });
  });

  it("la misma persona en chukkers distintos se acepta: es lo normal", () => {
    expect(validarGrilla([celda(1, "ana"), celda(2, "ana"), celda(3, "ana")]).ok).toBe(true);
  });

  it("dos huecos en el mismo chukker se aceptan: los huecos no compiten entre sí", () => {
    const resultado = validarGrilla([celda(4, null, "A", 1), celda(4, null, "A", 2)]);

    expect(resultado.ok).toBe(true);
  });

  it("una grilla inicial completa siempre es válida", () => {
    expect(validarGrilla(grillaInicial(OCHO_PUESTOS, 8)).ok).toBe(true);
  });
});

describe("puedeCerrar (T-704)", () => {
  const EMPIEZA = new Date("2026-12-03T21:00:00.000Z");

  it("una práctica confirmada que ya empezó se cierra", () => {
    const resultado = puedeCerrar(
      { estado: "confirmed", startsAt: EMPIEZA },
      new Date("2026-12-03T23:00:00.000Z"),
    );

    expect(resultado.ok).toBe(true);
  });

  it("justo al empezar ya se puede cerrar", () => {
    // El borde exacto: no se puede antes, sí se puede desde el instante mismo.
    expect(puedeCerrar({ estado: "confirmed", startsAt: EMPIEZA }, EMPIEZA).ok).toBe(true);
  });

  it("una que empieza en una hora NO se cierra", () => {
    const resultado = puedeCerrar(
      { estado: "confirmed", startsAt: EMPIEZA },
      new Date("2026-12-03T20:00:00.000Z"),
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toBe("todavia_no_empezo");
    }
  });

  it("una cancelada no se cierra: no se jugó", () => {
    const resultado = puedeCerrar(
      { estado: "cancelled", startsAt: EMPIEZA },
      new Date("2026-12-04T00:00:00.000Z"),
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toBe("no_esta_confirmada");
    }
  });

  it("una publicada sin decidir tampoco", () => {
    const resultado = puedeCerrar(
      { estado: "published", startsAt: EMPIEZA },
      new Date("2026-12-04T00:00:00.000Z"),
    );

    expect(resultado.ok).toBe(false);
  });

  it("una ya cerrada se rechaza con su propio motivo: para cambiarla hay que reabrirla", () => {
    const resultado = puedeCerrar(
      { estado: "played", startsAt: EMPIEZA },
      new Date("2026-12-04T00:00:00.000Z"),
    );

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).toBe("ya_cerrada");
    }
  });

  it("NO mira el reloj del sistema: la misma práctica da distinto según la hora que se le pase", () => {
    // Es la comprobación de P-08. Si el dominio mirara `new Date()`, este test no se podría escribir.
    const practica = { estado: "confirmed", startsAt: EMPIEZA };

    expect(puedeCerrar(practica, new Date("2026-12-03T20:59:59.999Z")).ok).toBe(false);
    expect(puedeCerrar(practica, new Date("2026-12-03T21:00:00.001Z")).ok).toBe(true);
  });
});
