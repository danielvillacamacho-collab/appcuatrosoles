import { describe, expect, it } from "vitest";
import { decidirPractica, estaAbiertaLaPostulacion } from "../decision.js";

const LA_HORA = new Date("2026-09-01T23:00:00Z"); // 6:00 p.m. en Bogotá
const publicada = { estado: "published" as const, minimo: 6, decisionAt: LA_HORA };

describe("decidirPractica · los cuatro resultados", () => {
  it("con los puestos suficientes, confirma", () => {
    expect(decidirPractica(publicada, 7, LA_HORA)).toBe("confirmar");
  });

  it("justo con el mínimo, confirma: el borde es inclusivo", () => {
    expect(decidirPractica(publicada, 6, LA_HORA)).toBe("confirmar");
  });

  it("con uno menos, cancela", () => {
    // Es el caso del documento: mínimo 6, hay 4, nadie prepara caballos en vano.
    expect(decidirPractica(publicada, 4, LA_HORA)).toBe("cancelar");
  });

  it("sin nadie, cancela", () => {
    expect(decidirPractica(publicada, 0, LA_HORA)).toBe("cancelar");
  });

  it("antes de la hora, todavía no", () => {
    const unMinutoAntes = new Date(LA_HORA.getTime() - 60_000);

    expect(decidirPractica(publicada, 0, unMinutoAntes)).toBe("todavia_no");
  });

  it("a la hora EXACTA ya se decide", () => {
    // «A las 6:00 p.m. se decide» significa que a las 6:00 p.m. en punto está decidido.
    expect(decidirPractica(publicada, 8, LA_HORA)).toBe("confirmar");
  });
});

describe("decidirPractica · de dónde sale la idempotencia (R-050-10)", () => {
  it("una práctica ya confirmada no se vuelve a decidir", () => {
    expect(decidirPractica({ ...publicada, estado: "confirmed" }, 8, LA_HORA)).toBe("ya_decidida");
  });

  it("una cancelada tampoco", () => {
    expect(decidirPractica({ ...publicada, estado: "cancelled" }, 8, LA_HORA)).toBe("ya_decidida");
  });

  it("un borrador no se decide solo", () => {
    // Una práctica que nadie publicó no existe para nadie (R-050-03), así que menos aún se
    // confirma sola.
    expect(decidirPractica({ ...publicada, estado: "draft" }, 8, LA_HORA)).toBe("ya_decidida");
  });
});

describe("decidirPractica · el sistema estuvo caído (R-050-11)", () => {
  it("tres horas tarde, decide igual", () => {
    // Es la prueba de que no hay nada programado que se pueda perder: la decisión depende de que la
    // hora haya pasado, no de que alguien la haya disparado en ese instante.
    const tresHorasDespues = new Date(LA_HORA.getTime() + 3 * 3_600_000);

    expect(decidirPractica(publicada, 7, tresHorasDespues)).toBe("confirmar");
    expect(decidirPractica(publicada, 2, tresHorasDespues)).toBe("cancelar");
  });

  it("una semana tarde, sigue decidiendo", () => {
    const unaSemana = new Date(LA_HORA.getTime() + 7 * 24 * 3_600_000);

    expect(decidirPractica(publicada, 7, unaSemana)).toBe("confirmar");
  });
});

describe("estaAbiertaLaPostulacion · los dos bordes", () => {
  const cierre = { closeAt: new Date("2026-09-01T20:00:00Z") };

  it("un minuto antes, abierta", () => {
    expect(estaAbiertaLaPostulacion(cierre, new Date("2026-09-01T19:59:00Z"))).toBe(true);
  });

  it("a la hora exacta, YA cerrada", () => {
    // Semiabierto como todo en el repo.
    expect(estaAbiertaLaPostulacion(cierre, cierre.closeAt)).toBe(false);
  });

  it("después, cerrada", () => {
    expect(estaAbiertaLaPostulacion(cierre, new Date("2026-09-01T20:00:01Z"))).toBe(false);
  });
});
