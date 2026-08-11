import { describe, expect, it } from "vitest";
import { toLocalDate } from "../../shared/localDate.js";
import { rangoDelDia } from "../dayRange.js";

const BOGOTA = "America/Bogota";

describe("rangoDelDia · «el martes» no es un instante hasta saber dónde queda el club", () => {
  it("un día en Bogotá empieza a las 05:00 UTC", () => {
    const dia = rangoDelDia("2026-09-01", BOGOTA);

    expect(dia.inicio.toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(dia.fin.toISOString()).toBe("2026-09-02T05:00:00.000Z");
  });

  it("dura exactamente 24 horas donde no hay cambio de hora", () => {
    const dia = rangoDelDia("2026-09-01", BOGOTA);

    expect(dia.fin.getTime() - dia.inicio.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("una actividad de las 7:00 p.m. cae en ESE día, no en el siguiente", () => {
    // Es el error que este cálculo existe para evitar: con la zona del servidor —que en producción
    // es UTC— las 7:00 p.m. de Bogotá son las 00:00 del día siguiente.
    const dia = rangoDelDia("2026-09-01", BOGOTA);
    const laPractica = new Date("2026-09-02T00:00:00Z"); // 7:00 p.m. del 1 en Bogotá

    expect(laPractica >= dia.inicio && laPractica < dia.fin).toBe(true);
  });

  it("es la inversa de `toLocalDate`: el inicio del día pertenece a ese día", () => {
    for (const dia of ["2026-01-01", "2026-06-15", "2026-09-01", "2026-12-31"]) {
      expect(toLocalDate(rangoDelDia(dia, BOGOTA).inicio, BOGOTA)).toBe(dia);
    }
  });

  it("el último instante del día sigue siendo del día, y el fin ya no", () => {
    // El rango es semiabierto, como todo en este módulo.
    const dia = rangoDelDia("2026-09-01", BOGOTA);

    expect(toLocalDate(new Date(dia.fin.getTime() - 1), BOGOTA)).toBe("2026-09-01");
    expect(toLocalDate(dia.fin, BOGOTA)).toBe("2026-09-02");
  });

  it("cruza el fin de mes y el fin de año sin ayuda", () => {
    expect(rangoDelDia("2026-09-30", BOGOTA).fin.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(rangoDelDia("2026-12-31", BOGOTA).fin.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});

describe("rangoDelDia · zonas que sí cambian de hora", () => {
  it("un día normal en Santiago dura 24 horas", () => {
    const dia = rangoDelDia("2026-06-15", "America/Santiago");

    expect(dia.fin.getTime() - dia.inicio.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("el día en que adelantan el reloj dura 23 horas, y el cálculo lo respeta", () => {
    // Chile adelanta el reloj en la noche del sábado 5 al domingo 6 de septiembre de 2026, así que
    // **el día corto es el sábado**: va de las 00:00 GMT-4 a las 00:00 GMT-3 del domingo.
    //
    // La primera versión de este test apuntaba al domingo y falló. El cálculo estaba bien; el test
    // estaba mal. Se comprobó contra `Intl` en qué día cambia el desfase antes de tocar nada — si
    // se hubiera «arreglado» el código para que el domingo diera 23, habría quedado mal para
    // siempre y con un test verde encima.
    const sabado = rangoDelDia("2026-09-05", "America/Santiago");
    const domingo = rangoDelDia("2026-09-06", "America/Santiago");

    expect((sabado.fin.getTime() - sabado.inicio.getTime()) / 3_600_000).toBe(23);
    expect((domingo.fin.getTime() - domingo.inicio.getTime()) / 3_600_000).toBe(24);
  });

  it("el día siguiente empieza donde termina el anterior, sin huecos ni solapes", () => {
    // Es la propiedad que de verdad importa: si al cambiar la hora quedara un hueco, una práctica
    // caería en ningún día y desaparecería del calendario.
    for (const [hoy, manana] of [["2026-09-04", "2026-09-05"], ["2026-09-05", "2026-09-06"]]) {
      expect(rangoDelDia(hoy ?? "", "America/Santiago").fin.toISOString()).toBe(
        rangoDelDia(manana ?? "", "America/Santiago").inicio.toISOString(),
      );
    }
  });

  it("el mismo día es un rango distinto en dos clubes de husos distintos", () => {
    const enBogota = rangoDelDia("2026-09-01", BOGOTA);
    const enMadrid = rangoDelDia("2026-09-01", "Europe/Madrid");

    expect(enBogota.inicio.toISOString()).not.toBe(enMadrid.inicio.toISOString());
  });
});
