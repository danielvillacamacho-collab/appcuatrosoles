import { describe, expect, it } from "vitest";
import { esRangoValido, seSolapan, type RangoDeTiempo } from "../overlap.js";

/** `2026-09-01` a esa hora en Bogotá. Las horas se leen como las diría el club. */
function alas(hora: string): Date {
  return new Date(`2026-09-01T${hora}:00-05:00`);
}

function rango(desde: string, hasta: string): RangoDeTiempo {
  return { inicio: alas(desde), fin: alas(hasta) };
}

describe("seSolapan · el borde, que es lo único que importa aquí", () => {
  it("lo que empieza a las 5:30 va DESPUÉS de lo que termina a las 5:30", () => {
    // La convención semiabierta (R-040-04). Sin ella el club no podría programar una práctica
    // detrás de otra: la segunda chocaría con la primera por un instante que ninguna ocupa.
    expect(seSolapan(rango("16:00", "17:30"), rango("17:30", "19:00"))).toBe(false);
  });

  it("un solo minuto de invasión ya es un choque", () => {
    expect(seSolapan(rango("16:00", "17:30"), rango("17:29", "19:00"))).toBe(true);
  });

  it("un solo segundo también", () => {
    const a = { inicio: alas("16:00"), fin: alas("17:30") };
    const b = { inicio: new Date(alas("17:30").getTime() - 1000), fin: alas("19:00") };

    expect(seSolapan(a, b)).toBe(true);
  });
});

describe("seSolapan · los demás casos", () => {
  it("dos rangos idénticos se solapan", () => {
    expect(seSolapan(rango("16:00", "17:30"), rango("16:00", "17:30"))).toBe(true);
  });

  it("uno contenido en el otro se solapa, en los dos sentidos", () => {
    const grande = rango("16:00", "19:00");
    const chico = rango("17:00", "18:00");

    expect(seSolapan(grande, chico)).toBe(true);
    expect(seSolapan(chico, grande)).toBe(true);
  });

  it("dos rangos separados no se solapan", () => {
    expect(seSolapan(rango("16:00", "17:00"), rango("18:00", "19:00"))).toBe(false);
  });

  it("el orden de los argumentos no cambia la respuesta", () => {
    // Es simétrica, y quien la use no debería tener que acordarse de en qué orden preguntar.
    const a = rango("16:00", "17:30");
    const b = rango("17:00", "18:00");

    expect(seSolapan(a, b)).toBe(seSolapan(b, a));
  });

  it("un rango de duración cero no se solapa con nada, ni consigo mismo", () => {
    // No es un caso de negocio —la base lo rechaza con un CHECK— pero la función tiene que
    // responder algo coherente: un rango que no contiene ningún instante no ocupa nada.
    const vacio = rango("17:00", "17:00");

    expect(seSolapan(vacio, rango("16:00", "19:00"))).toBe(false);
    expect(seSolapan(vacio, vacio)).toBe(false);
  });
});

describe("esRangoValido", () => {
  it("acepta el que termina después de empezar", () => {
    expect(esRangoValido(rango("16:00", "17:30"))).toBe(true);
  });

  it("rechaza el que termina antes de empezar", () => {
    expect(esRangoValido(rango("17:30", "16:00"))).toBe(false);
  });

  it("rechaza el de duración cero", () => {
    // La base lo rechaza igual; esto permite decirlo con un mensaje que la persona entienda, en
    // vez de con un error de PostgreSQL.
    expect(esRangoValido(rango("17:00", "17:00"))).toBe(false);
  });
});
