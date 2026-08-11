import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchSimulado, montar, type RespuestaSimulada } from "../../test/montar.js";
import { copy } from "../../i18n/es-CO.js";

const CLUB = { estado: 200, cuerpo: { name: "Club Los Pinos", timezone: "America/Bogota" } };

function yo(roles: { role: string }[]): RespuestaSimulada {
  return {
    estado: 200,
    cuerpo: {
      userAccountId: "u1",
      personId: "p1",
      fullName: "María Fernanda",
      email: "maria@lospinos.test",
      pendingEmail: null,
      phone: null,
      photoKey: null,
      roles: roles.map((rol) => ({ ...rol, scope: "club", scopeId: "c1" })),
      organizations: [],
      membershipCategory: null,
    },
  };
}

const EL_DIA = "2026-09-01";

/** 16:00–17:30 en Bogotá, público; 08:00–09:00 privado ajeno, ya reducido por el servidor. */
const DIA_CON_ACTIVIDAD: RespuestaSimulada = {
  estado: 200,
  cuerpo: {
    date: EL_DIA,
    timezone: "America/Bogota",
    fields: [
      {
        id: "f1",
        name: "Cancha 1",
        entries: [
          {
            detalle: false,
            startsAt: "2026-09-01T13:00:00.000Z",
            endsAt: "2026-09-01T14:00:00.000Z",
          },
          {
            detalle: true,
            id: "b1",
            startsAt: "2026-09-01T21:00:00.000Z",
            endsAt: "2026-09-01T22:30:00.000Z",
            type: "maintenance",
            reason: "Riego programado",
            sourceId: null,
          },
        ],
      },
      { id: "f2", name: "Cancha 2", entries: [] },
    ],
  },
};

function conApi(extra: Record<string, RespuestaSimulada | (() => RespuestaSimulada)>): ReturnType<typeof vi.fn> {
  const espia = vi.fn(
    fetchSimulado({
      "/api/clubs/current/public": CLUB,
      "/api/me": yo([{ role: "club_admin" }]),
      ...extra,
    }),
  );
  vi.stubGlobal("fetch", espia);

  return espia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Calendario del día (T-460)", () => {
  it("muestra cada cancha con lo suyo, y la vacía como libre todo el día", async () => {
    conApi({ [`/api/calendar?date=${EL_DIA}`]: DIA_CON_ACTIVIDAD });
    montar(`/calendar?date=${EL_DIA}`);

    expect(await screen.findByRole("heading", { name: "Cancha 1" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Cancha 2" })).toBeDefined();
    expect(screen.getByText(copy.calendario.libreTodoElDia)).toBeDefined();
  });

  it("las horas se pintan en la zona del club, no la del navegador", async () => {
    // 21:00 UTC son las 4:00 p.m. en Bogotá. jsdom corre en la zona de la máquina: si la pantalla
    // usara la zona local, este texto cambiaría según dónde corra el test — y según dónde viva
    // quien mira.
    conApi({ [`/api/calendar?date=${EL_DIA}`]: DIA_CON_ACTIVIDAD });
    montar(`/calendar?date=${EL_DIA}`);

    expect(await screen.findByText(/4:00.*5:30/u)).toBeDefined();
  });

  it("lo ajeno y privado es «Ocupado» con su horario, y nada más se renderiza", async () => {
    conApi({ [`/api/calendar?date=${EL_DIA}`]: DIA_CON_ACTIVIDAD });
    montar(`/calendar?date=${EL_DIA}`);

    const ocupado = await screen.findByText(new RegExp(copy.calendario.ocupado, "u"));

    // 13:00 UTC = 8:00 a.m. Bogotá.
    expect(ocupado.textContent).toMatch(/8:00.*9:00/u);
  });

  it("el hueco entre actividades se muestra como libre: es la otra mitad de la pregunta", async () => {
    conApi({ [`/api/calendar?date=${EL_DIA}`]: DIA_CON_ACTIVIDAD });
    montar(`/calendar?date=${EL_DIA}`);

    // Entre las 9:00 y las 4:00 p.m. no hay nada programado.
    expect(await screen.findByText(copy.calendario.libreEntre("9:00 a. m.", "4:00 p. m."))).toBeDefined();
  });

  it("navegar al día siguiente cambia la URL: el día es un enlace que se puede mandar", async () => {
    const espia = conApi({
      [`/api/calendar?date=${EL_DIA}`]: DIA_CON_ACTIVIDAD,
      "/api/calendar?date=2026-09-02": { estado: 200, cuerpo: { ...DIA_CON_ACTIVIDAD.cuerpo as object, date: "2026-09-02", fields: [] } },
    });
    const persona = userEvent.setup();
    const pantalla = montar(`/calendar?date=${EL_DIA}`);

    await persona.click(await screen.findByRole("button", { name: copy.calendario.diaSiguiente }));

    await waitFor(() => {
      expect(pantalla.ubicacion()).toContain("2026-09-02");
    });
    expect(espia.mock.calls.some(([url]) => url === "/api/calendar?date=2026-09-02")).toBe(true);
  });

  it("un jugador no ve el botón de bloquear: ofrecer lo que el API rechaza es mentir", async () => {
    conApi({
      "/api/me": yo([{ role: "player" }]),
      [`/api/calendar?date=${EL_DIA}`]: DIA_CON_ACTIVIDAD,
    });
    montar(`/calendar?date=${EL_DIA}`);

    await screen.findByRole("heading", { name: "Cancha 1" });
    expect(screen.queryByRole("button", { name: copy.calendario.bloquear })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.calendario.levantarBloqueo })).toBeNull();
  });
});

describe("Bloquear una franja (T-462)", () => {
  it("manda instantes en la zona del club, construidos desde la hora de pared", async () => {
    // La persona escribe «16:00» y el API tiene que recibir 21:00 UTC: la conversión la hace
    // `instanteDelDia` del dominio, no un `-05:00` pegado a mano.
    const espia = conApi({
      [`/api/calendar?date=${EL_DIA}`]: DIA_CON_ACTIVIDAD,
      "POST /api/field-bookings/block": {
        estado: 201,
        cuerpo: { id: "nb", fieldId: "f1", startsAt: "x", endsAt: "y", type: "maintenance", reason: "Riego" },
      },
    });
    const persona = userEvent.setup();
    montar(`/calendar?date=${EL_DIA}`);

    await persona.click(await screen.findByRole("button", { name: copy.calendario.bloquear }));

    const desde = screen.getByLabelText(copy.bloquearFranja.desde);
    const hasta = screen.getByLabelText(copy.bloquearFranja.hasta);
    await persona.clear(desde);
    await persona.type(desde, "10:00");
    await persona.clear(hasta);
    await persona.type(hasta, "11:30");
    await persona.type(screen.getByLabelText(copy.bloquearFranja.motivo), "Riego");
    await persona.click(screen.getByRole("button", { name: copy.bloquearFranja.bloquear }));

    await waitFor(() => {
      const enviada = espia.mock.calls.find(
        ([url, init]) => url === "/api/field-bookings/block" && (init as RequestInit | undefined)?.body !== undefined,
      );
      expect(JSON.parse((enviada?.[1] as RequestInit).body as string)).toEqual({
        fieldId: "f1",
        startsAt: "2026-09-01T15:00:00.000Z",
        endsAt: "2026-09-01T16:30:00.000Z",
        reason: "Riego",
      });
    });
  });

  it("sin motivo no viaja nada: el formulario lo exige, no sólo el API", async () => {
    const espia = conApi({ [`/api/calendar?date=${EL_DIA}`]: DIA_CON_ACTIVIDAD });
    const persona = userEvent.setup();
    montar(`/calendar?date=${EL_DIA}`);

    await persona.click(await screen.findByRole("button", { name: copy.calendario.bloquear }));
    await persona.click(screen.getByRole("button", { name: copy.bloquearFranja.bloquear }));

    expect(await screen.findByText(copy.bloquearFranja.motivoRequerido)).toBeDefined();
    expect(espia.mock.calls.some(([url]) => url === "/api/field-bookings/block")).toBe(false);
  });

  it("el choque se explica con el texto del club, no con el del servidor", async () => {
    conApi({
      [`/api/calendar?date=${EL_DIA}`]: DIA_CON_ACTIVIDAD,
      "POST /api/field-bookings/block": {
        estado: 409,
        cuerpo: { error: { code: "cancha_ocupada", message: "del servidor", requestId: "a" } },
      },
    });
    const persona = userEvent.setup();
    montar(`/calendar?date=${EL_DIA}`);

    await persona.click(await screen.findByRole("button", { name: copy.calendario.bloquear }));
    await persona.type(screen.getByLabelText(copy.bloquearFranja.motivo), "Riego");
    await persona.click(screen.getByRole("button", { name: copy.bloquearFranja.bloquear }));

    expect((await screen.findAllByRole("alert")).map((a) => a.textContent)).toContain(
      copy.errores.cancha_ocupada,
    );
  });
});
