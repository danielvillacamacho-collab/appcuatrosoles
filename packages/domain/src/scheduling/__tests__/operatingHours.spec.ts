import { describe, expect, it } from "vitest";
import { cabeEnElHorario, leerHorario } from "../operatingHours.js";

const BOGOTA = "America/Bogota";
const DE_SEIS_A_SEIS = "06:00-18:00";

function rango(desde: string, hasta: string, dia = "2026-09-01"): { inicio: Date; fin: Date } {
  return { inicio: new Date(`${dia}T${desde}:00-05:00`), fin: new Date(`${dia}T${hasta}:00-05:00`) };
}

describe("cabeEnElHorario · lo que entra", () => {
  it("una práctica de la tarde entra", () => {
    expect(cabeEnElHorario(rango("16:00", "17:30"), DE_SEIS_A_SEIS, BOGOTA).ok).toBe(true);
  });

  it("empezar exactamente a la hora de apertura entra", () => {
    // El borde concede: el club abre a las 6:00, así que a las 6:00 se puede jugar.
    expect(cabeEnElHorario(rango("06:00", "07:30"), DE_SEIS_A_SEIS, BOGOTA).ok).toBe(true);
  });

  it("terminar exactamente a la hora de cierre entra", () => {
    expect(cabeEnElHorario(rango("16:30", "18:00"), DE_SEIS_A_SEIS, BOGOTA).ok).toBe(true);
  });
});

describe("cabeEnElHorario · lo que no, y por qué", () => {
  it("empezar antes de abrir se rechaza diciendo cuál fue el problema", () => {
    // Devuelve el motivo y no un booleano porque «el club abre a las 6:00» y «el club cierra a las
    // 18:00» son mensajes distintos, y con un booleano quien llama tendría que recalcular cuál.
    expect(cabeEnElHorario(rango("05:30", "07:00"), DE_SEIS_A_SEIS, BOGOTA)).toEqual({
      ok: false,
      error: "antes_de_abrir",
    });
  });

  it("terminar después de cerrar se rechaza", () => {
    expect(cabeEnElHorario(rango("17:00", "19:00"), DE_SEIS_A_SEIS, BOGOTA)).toEqual({
      ok: false,
      error: "despues_de_cerrar",
    });
  });

  it("un rango que cruza la medianoche no cabe en ninguna ventana diaria", () => {
    const nocturno = { inicio: new Date("2026-09-01T23:00:00-05:00"), fin: new Date("2026-09-02T01:00:00-05:00") };

    expect(cabeEnElHorario(nocturno, DE_SEIS_A_SEIS, BOGOTA)).toEqual({
      ok: false,
      error: "no_cabe_en_un_dia",
    });
  });
});

describe("cabeEnElHorario · la zona del club, no la del servidor", () => {
  it("las 4:00 p.m. en Bogotá entran, aunque en UTC sean las 9:00 p.m.", () => {
    // Con `getHours()` esto se leería como las 21:00 y quedaría fuera del horario sin que nada lo
    // explique. En producción el servidor corre en UTC, así que el fallo aparecería sólo allá.
    const tarde = { inicio: new Date("2026-09-01T21:00:00Z"), fin: new Date("2026-09-01T22:30:00Z") };

    expect(cabeEnElHorario(tarde, DE_SEIS_A_SEIS, BOGOTA).ok).toBe(true);
  });

  it("el mismo instante puede caber en un club y no en otro", () => {
    // El producto se vende a otros clubes (`docs/09` D-01): el horario es una hora de pared, y a
    // qué instante corresponde depende de dónde queda el club.
    const instante = { inicio: new Date("2026-09-01T21:00:00Z"), fin: new Date("2026-09-01T22:00:00Z") };

    expect(cabeEnElHorario(instante, DE_SEIS_A_SEIS, BOGOTA).ok).toBe(true);
    expect(cabeEnElHorario(instante, DE_SEIS_A_SEIS, "America/Argentina/Buenos_Aires").ok).toBe(false);
  });
});

describe("leerHorario · el valor viene de configuración y puede venir mal", () => {
  it("lee el formato del catálogo", () => {
    expect(leerHorario("06:00-18:00")).toEqual({ ok: true, value: { apertura: 360, cierre: 1080 } });
  });

  for (const malo of ["6-18", "06:00 a 18:00", "0600-1800", "", "18:00-06:00", "06:00-25:00", "06:70-18:00"]) {
    it(`rechaza «${malo}» en vez de comparar contra NaN`, () => {
      // Sin esta validación, un horario mal escrito produce comparaciones que **siempre dan
      // falso**: el club no puede programar nada y no hay nada en pantalla que explique por qué.
      expect(leerHorario(malo)).toEqual({ ok: false, error: "horario_mal_escrito" });
    });
  }

  it("un horario mal escrito hace fallar la comprobación entera, no la deja pasar", () => {
    expect(cabeEnElHorario(rango("16:00", "17:30"), "cualquier cosa", BOGOTA)).toEqual({
      ok: false,
      error: "horario_mal_escrito",
    });
  });
});
