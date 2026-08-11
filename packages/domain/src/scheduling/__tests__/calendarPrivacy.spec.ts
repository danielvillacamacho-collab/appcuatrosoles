import { describe, expect, it } from "vitest";
import { puedeVerElDetalle, type EventoDelCalendario, type QuienMira } from "../calendarPrivacy.js";

const MARIA = "cuenta-de-maria";
const PEDRO = "cuenta-de-pedro";

function evento(extra: Partial<EventoDelCalendario> = {}): EventoDelCalendario {
  return { visibility: "private", createdById: PEDRO, ...extra };
}

function mira(userAccountId: string | null, participa = false): QuienMira {
  return { userAccountId, participa };
}

describe("puedeVerElDetalle · los seis casos (R-040-07)", () => {
  it("participante: ve el detalle de lo suyo", () => {
    expect(puedeVerElDetalle(evento(), mira(MARIA, true))).toBe(true);
  });

  it("creador: ve lo que él programó", () => {
    // Quien puso un bloqueo de riego o reservó una cancha ve lo que hizo, aunque no participe.
    expect(puedeVerElDetalle(evento({ createdById: MARIA }), mira(MARIA))).toBe(true);
  });

  it("evento público ajeno: se ve, porque es la vida del club", () => {
    // Las prácticas y las copas son públicas: esconderlas haría inútil el calendario.
    expect(puedeVerElDetalle(evento({ visibility: "public" }), mira(MARIA))).toBe(true);
  });

  it("evento PRIVADO ajeno: sólo «Ocupado»", () => {
    // Es la promesa del módulo: nadie debe poder deducir del calendario quién toma clases o taquea
    // a cierta hora.
    expect(puedeVerElDetalle(evento(), mira(MARIA))).toBe(false);
  });

  it("evento privado propio pero creado por otro: se ve si participa", () => {
    // El club programa una clase particular para María: no la creó ella, pero es suya.
    expect(puedeVerElDetalle(evento({ createdById: PEDRO }), mira(MARIA, true))).toBe(true);
  });

  it("sin sesión: nada, ni siquiera lo público", () => {
    // Hoy el calendario está detrás del guard y este caso no puede ocurrir. Existe decidido y
    // probado para el día que alguien quiera abrirlo al público, que es justo cuando nadie quiere
    // estar decidiendo reglas de privacidad.
    expect(puedeVerElDetalle(evento({ visibility: "public" }), mira(null))).toBe(false);
    expect(puedeVerElDetalle(evento(), mira(null, true))).toBe(false);
  });
});

describe("puedeVerElDetalle · lo que NO alcanza para ver", () => {
  it("ser del mismo club no alcanza: la regla es por evento, no por pertenencia", () => {
    // Todas las personas de este test son del mismo club. Si pertenecer bastara, el calendario
    // publicaría las clases particulares de todo el mundo entre sí.
    expect(puedeVerElDetalle(evento(), mira(MARIA))).toBe(false);
  });

  it("un identificador parecido no es el mismo: la comparación es exacta", () => {
    expect(puedeVerElDetalle(evento({ createdById: `${MARIA}-otro` }), mira(MARIA))).toBe(false);
  });
});
