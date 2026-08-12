import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchSimulado, montar, type RespuestaSimulada } from "../../test/montar.js";
import { copy } from "../../i18n/es-CO.js";

const CLUB = { estado: 200, cuerpo: { name: "Club Los Pinos", timezone: "America/Bogota" } };
const PERSONA = "p-juan";

function yo(rol: string): RespuestaSimulada {
  return {
    estado: 200,
    cuerpo: {
      userAccountId: "u1",
      personId: "p-quien-mira",
      fullName: "Quien mira",
      email: "mira@lospinos.test",
      pendingEmail: null,
      phone: null,
      photoKey: null,
      roles: [{ role: rol, scope: "club", scopeId: "c1" }],
      organizations: [],
      membershipCategory: null,
    },
  };
}

/** Mismo molde que `users.spec.tsx`: sin `invitationSentAt` la ficha revienta al formatear fechas. */
const USUARIO: RespuestaSimulada = {
  estado: 200,
  cuerpo: {
    id: "u-juan",
    personId: PERSONA,
    fullName: "Juan Polo",
    email: "juan@lospinos.test",
    phone: null,
    status: "active",
    invitationSentAt: null,
    roles: [],
    organizations: [],
    membershipCategory: null,
  },
};

function handicaps(club: Record<string, unknown>, international?: Record<string, unknown>): RespuestaSimulada {
  return {
    estado: 200,
    cuerpo: {
      personId: PERSONA,
      club: { valueHalves: -4, calificado: false, updatedAt: null, ...club },
      international: {
        valueHalves: -4,
        calificado: false,
        updatedAt: null,
        ...(international ?? {}),
      },
    },
  };
}

function conApi(
  rol: string,
  extra: Record<string, RespuestaSimulada | (() => RespuestaSimulada)> = {},
): ReturnType<typeof vi.fn> {
  const espia = vi.fn(
    fetchSimulado({
      "/api/clubs/current/public": CLUB,
      "/api/me": yo(rol),
      "/api/users/u-juan": USUARIO,
      [`/api/audit-log?entityId=${PERSONA}`]: { estado: 200, cuerpo: [] },
      [`/api/people/${PERSONA}/handicaps`]: handicaps({ valueHalves: 5, calificado: true }),
      ...extra,
    }),
  );
  vi.stubGlobal("fetch", espia);

  return espia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("El handicap en la ficha de una persona (T-340)", () => {
  it("muestra los dos valores, en goles y con coma", async () => {
    conApi("club_admin");
    montar("/users/u-juan");

    // 5 medios goles son 2,5.
    expect(await screen.findByText("2,5")).toBeDefined();
    expect(screen.getByText(copy.handicaps.internacional)).toBeDefined();
    expect(screen.getByText(copy.handicaps.delClub)).toBeDefined();
  });

  it("distingue «sin calificar» de un −2 puesto por el comisario", async () => {
    // **Es el test de la decisión D-030-02.** Los dos valen −4 medios; sin palabras, la pantalla no
    // podría diferenciarlos.
    conApi("club_admin", {
      [`/api/people/${PERSONA}/handicaps`]: handicaps(
        { valueHalves: -4, calificado: true, updatedAt: "2026-02-01T00:00:00.000Z" },
        { valueHalves: -4, calificado: false },
      ),
    });
    montar("/users/u-juan");

    await screen.findByText(copy.handicaps.titulo);

    // Los dos valores son exactamente «−2». Se busca el texto exacto y no una expresión regular:
    // el aviso de ayuda también menciona −2, y con `/−2/` este test contaba tres.
    expect(screen.getAllByText("−2")).toHaveLength(2);
    // Y sólo uno de los dos lleva el aviso.
    expect(screen.getAllByText(copy.handicaps.sinCalificar, { exact: false })).toHaveLength(1);
  });

  it("un administrador NO ve el botón de fijar: sólo el comisario puede", async () => {
    conApi("club_admin");
    montar("/users/u-juan");

    await screen.findByText(copy.handicaps.titulo);
    expect(screen.queryByRole("button", { name: copy.handicaps.fijar })).toBeNull();
  });

  it("el comisario sí lo ve, uno por cada tipo", async () => {
    conApi("commissioner");
    montar("/users/u-juan");

    expect(await screen.findAllByRole("button", { name: copy.handicaps.fijar })).toHaveLength(2);
  });
});

describe("Fijar un handicap (T-341)", () => {
  it("el comisario escribe goles y el API recibe medios goles", async () => {
    const espia = conApi("commissioner", {
      [`PUT /api/people/${PERSONA}/handicaps/club`]: handicaps({ valueHalves: 6, calificado: true }),
    });
    const persona = userEvent.setup();
    montar("/users/u-juan");

    const botones = await screen.findAllByRole("button", { name: copy.handicaps.fijar });
    await persona.click(botones[1] as HTMLElement);

    const valor = screen.getByLabelText(copy.handicaps.nuevoValor);
    await persona.clear(valor);
    await persona.type(valor, "3");
    await persona.type(screen.getByLabelText(copy.handicaps.motivo), "buen semestre");
    await persona.click(screen.getByRole("button", { name: copy.handicaps.guardar }));

    await waitFor(() => {
      const enviada = espia.mock.calls.find(
        ([url, init]) =>
          url === `/api/people/${PERSONA}/handicaps/club` &&
          (init as RequestInit | undefined)?.body !== undefined,
      );
      expect(JSON.parse((enviada?.[1] as RequestInit).body as string)).toEqual({
        valueHalves: 6,
        reason: "buen semestre",
      });
    });
  });

  it("«2,3» no viaja: no es un handicap, y la pantalla no lo redondea", async () => {
    const espia = conApi("commissioner");
    const persona = userEvent.setup();
    montar("/users/u-juan");

    const botones = await screen.findAllByRole("button", { name: copy.handicaps.fijar });
    await persona.click(botones[1] as HTMLElement);

    const valor = screen.getByLabelText(copy.handicaps.nuevoValor);
    await persona.clear(valor);
    await persona.type(valor, "2,3");
    await persona.type(screen.getByLabelText(copy.handicaps.motivo), "no debería pasar");
    await persona.click(screen.getByRole("button", { name: copy.handicaps.guardar }));

    expect(await screen.findByText(copy.handicaps.valorInvalido)).toBeDefined();
    expect(
      espia.mock.calls.some(([url]) => url === `/api/people/${PERSONA}/handicaps/club`),
    ).toBe(false);
  });

  it("sin motivo no viaja nada: el formulario lo exige, no sólo el API", async () => {
    const espia = conApi("commissioner");
    const persona = userEvent.setup();
    montar("/users/u-juan");

    const botones = await screen.findAllByRole("button", { name: copy.handicaps.fijar });
    await persona.click(botones[1] as HTMLElement);

    const valor = screen.getByLabelText(copy.handicaps.nuevoValor);
    await persona.clear(valor);
    await persona.type(valor, "4");
    await persona.click(screen.getByRole("button", { name: copy.handicaps.guardar }));

    expect(await screen.findByText(copy.handicaps.motivoRequerido)).toBeDefined();
    expect(
      espia.mock.calls.some(([url]) => url === `/api/people/${PERSONA}/handicaps/club`),
    ).toBe(false);
  });

  it("«ya tiene ese handicap» se explica con el texto del club, no con el del servidor", async () => {
    conApi("commissioner", {
      [`PUT /api/people/${PERSONA}/handicaps/club`]: {
        estado: 409,
        cuerpo: { error: { code: "handicap_sin_cambio", message: "del servidor", requestId: "a" } },
      },
    });
    const persona = userEvent.setup();
    montar("/users/u-juan");

    const botones = await screen.findAllByRole("button", { name: copy.handicaps.fijar });
    await persona.click(botones[1] as HTMLElement);

    const valor = screen.getByLabelText(copy.handicaps.nuevoValor);
    await persona.clear(valor);
    await persona.type(valor, "2,5");
    await persona.type(screen.getByLabelText(copy.handicaps.motivo), "igual");
    await persona.click(screen.getByRole("button", { name: copy.handicaps.guardar }));

    expect((await screen.findAllByRole("alert")).map((alerta) => alerta.textContent)).toContain(
      copy.errores.handicap_sin_cambio,
    );
  });
});

describe("El historial (T-342)", () => {
  const HISTORIAL: RespuestaSimulada = {
    estado: 200,
    cuerpo: {
      personId: PERSONA,
      entries: [
        {
          id: "h2",
          type: "club",
          previousHalves: 4,
          newHalves: 5,
          reason: "buen semestre",
          changedAt: "2026-03-01T15:00:00.000Z",
          changedBy: { personId: "p-com", fullName: "El Comisario" },
          season: { id: "s1", name: "2026-I" },
        },
      ],
    },
  };

  it("muestra el cambio, el motivo, quién y la temporada", async () => {
    conApi("club_admin", { [`/api/people/${PERSONA}/handicaps/history`]: HISTORIAL });
    const persona = userEvent.setup();
    montar("/users/u-juan");

    await persona.click(await screen.findByRole("button", { name: copy.handicaps.verHistorial }));

    // 4 → 5 medios son 2 → 2,5.
    expect(await screen.findByText(copy.handicaps.cambio("2", "2,5"))).toBeDefined();
    expect(screen.getByText("buen semestre")).toBeDefined();
    expect(screen.getByText(/El Comisario/u)).toBeDefined();
    expect(screen.getByText(/2026-I/u)).toBeDefined();
  });

  it("un historial vacío lo dice, en vez de quedar en blanco", async () => {
    conApi("club_admin", {
      [`/api/people/${PERSONA}/handicaps/history`]: {
        estado: 200,
        cuerpo: { personId: PERSONA, entries: [] },
      },
    });
    const persona = userEvent.setup();
    montar("/users/u-juan");

    await persona.click(await screen.findByRole("button", { name: copy.handicaps.verHistorial }));

    expect(await screen.findByText(copy.handicaps.historialVacio)).toBeDefined();
  });

  it("a quien no puede verlo el API responde 404, y la pantalla no insiste", async () => {
    // `retry: false`: reintentar un 404 sólo demora el momento en que deja de decir «cargando».
    const espia = conApi("player", {
      [`/api/people/${PERSONA}/handicaps/history`]: { estado: 404, cuerpo: {} },
    });
    const persona = userEvent.setup();
    montar("/users/u-juan");

    await persona.click(await screen.findByRole("button", { name: copy.handicaps.verHistorial }));

    await screen.findByRole("alert");

    const intentos = espia.mock.calls.filter(
      ([url]) => url === `/api/people/${PERSONA}/handicaps/history`,
    );

    expect(intentos).toHaveLength(1);
  });
});
