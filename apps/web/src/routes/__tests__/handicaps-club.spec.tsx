import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchSimulado, montar, type RespuestaSimulada } from "../../test/montar.js";
import { copy } from "../../i18n/es-CO.js";

const CLUB = { estado: 200, cuerpo: { name: "Club Los Pinos", timezone: "America/Bogota" } };

function yo(rol: string): RespuestaSimulada {
  return {
    estado: 200,
    cuerpo: {
      userAccountId: "u1",
      personId: "p-com",
      fullName: "Comisario",
      email: "com@lospinos.test",
      pendingEmail: null,
      phone: null,
      photoKey: null,
      roles: [{ role: rol, scope: "club", scopeId: "c1" }],
      organizations: [],
      membershipCategory: null,
    },
  };
}

function listado(items: unknown[], total = items.length): RespuestaSimulada {
  return { estado: 200, cuerpo: { items, total, page: 1, limit: 25 } };
}

const FILAS = [
  {
    personId: "p-1",
    fullName: "Ana Polo",
    handicap: { valueHalves: 5, calificado: true, updatedAt: "2026-02-01T00:00:00.000Z" },
  },
  {
    personId: "p-2",
    fullName: "Beto Polo",
    handicap: { valueHalves: -4, calificado: false, updatedAt: null },
  },
];

function conApi(
  rol: string,
  extra: Record<string, RespuestaSimulada | (() => RespuestaSimulada)> = {},
): ReturnType<typeof vi.fn> {
  const espia = vi.fn(
    fetchSimulado({
      "/api/clubs/current/public": CLUB,
      "/api/me": yo(rol),
      "/api/handicaps?type=club&page=1": listado(FILAS),
      ...extra,
    }),
  );
  vi.stubGlobal("fetch", espia);

  return espia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Handicaps del club (T-343)", () => {
  it("lista a todo el club con su handicap", async () => {
    conApi("commissioner");
    montar("/handicaps");

    expect(await screen.findByText("Ana Polo")).toBeDefined();
    expect(screen.getByText("Beto Polo")).toBeDefined();
    // 5 medios son 2,5.
    expect(screen.getByText("2,5")).toBeDefined();
  });

  it("marca a quien nunca fue calificado, aunque el número sea el mismo que un −2 real", async () => {
    conApi("commissioner");
    montar("/handicaps");

    await screen.findByText("Beto Polo");
    expect(screen.getAllByText(copy.handicaps.sinCalificar)).toHaveLength(1);
  });

  it("es la puerta de entrada del comisario, que NO puede abrir el listado de usuarios", async () => {
    // El motivo de que esta pantalla exista: `GET /users` exige `user.edit`, que el comisario no
    // tiene ni debe tener. Sin ella, el único rol que puede fijar un handicap no llegaba nunca a
    // la pantalla donde se fija.
    const espia = conApi("commissioner", {
      "/api/people/p-1/handicaps": {
        estado: 200,
        cuerpo: {
          personId: "p-1",
          club: { valueHalves: 5, calificado: true, updatedAt: null },
          international: { valueHalves: -4, calificado: false, updatedAt: null },
        },
      },
    });
    const persona = userEvent.setup();
    montar("/handicaps");

    await persona.click(await screen.findByRole("button", { name: /Ana Polo/u }));

    expect(await screen.findAllByRole("button", { name: copy.handicaps.fijar })).toHaveLength(2);
    // Y llegó ahí sin pedir el listado de usuarios ni una sola vez.
    expect(espia.mock.calls.some(([url]) => String(url).startsWith("/api/users"))).toBe(false);
  });

  it("un jugador ve los números pero ningún botón de fijar", async () => {
    conApi("player", {
      "/api/people/p-1/handicaps": {
        estado: 200,
        cuerpo: {
          personId: "p-1",
          club: { valueHalves: 5, calificado: true, updatedAt: null },
          international: { valueHalves: -4, calificado: false, updatedAt: null },
        },
      },
    });
    const persona = userEvent.setup();
    montar("/handicaps");

    await persona.click(await screen.findByRole("button", { name: /Ana Polo/u }));

    await screen.findByRole("heading", { name: copy.handicaps.titulo });
    expect(screen.queryByRole("button", { name: copy.handicaps.fijar })).toBeNull();
  });

  it("no pagina cuando todo cabe en una página", async () => {
    conApi("commissioner");
    montar("/handicaps");

    await screen.findByText("Ana Polo");
    expect(screen.queryByLabelText(copy.handicapsDelClub.paginacion)).toBeNull();
  });

  it("pagina cuando hay más de una, y dice el total", async () => {
    conApi("commissioner", { "/api/handicaps?type=club&page=1": listado(FILAS, 137) });
    montar("/handicaps");

    await screen.findByText("Ana Polo");
    expect(screen.getByText(copy.handicapsDelClub.deTotal(1, 6, 137))).toBeDefined();
  });
});
