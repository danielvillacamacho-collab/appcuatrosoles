import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchSimulado, montar, type RespuestaSimulada } from "../../test/montar.js";
import { copy } from "../../i18n/es-CO.js";

const CLUB = { estado: 200, cuerpo: { name: "Club Los Pinos", timezone: "America/Bogota" } };

function yo(rol: string, personId = "p-yo"): RespuestaSimulada {
  return {
    estado: 200,
    cuerpo: {
      userAccountId: "u1",
      personId,
      fullName: "Quien mira",
      email: "yo@lospinos.test",
      pendingEmail: null,
      phone: null,
      photoKey: null,
      roles: [{ role: rol, scope: "club", scopeId: "c1" }],
      organizations: [],
      membershipCategory: null,
    },
  };
}

/** Dos jugadores en dos chukkers: lo mínimo para que la matriz signifique algo. */
function grilla(extra: Record<string, unknown> = {}): RespuestaSimulada {
  const celdas = [];

  for (const chukker of [1, 2]) {
    celdas.push({
      chukker,
      equipo: "A",
      position: 1,
      persona: { personId: "p-ana", fullName: "Ana Polo" },
    });
    celdas.push({
      chukker,
      equipo: "B",
      position: 1,
      persona: { personId: "p-luis", fullName: "Luis Polo" },
    });
  }

  return {
    estado: 200,
    cuerpo: {
      chukkers: 2,
      cerrada: false,
      celdas,
      chukkersPorPersona: [
        { personId: "p-ana", fullName: "Ana Polo", chukkers: 2, noSePresento: false },
        { personId: "p-luis", fullName: "Luis Polo", chukkers: 2, noSePresento: false },
      ],
      resultado: null,
      ...extra,
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
      "/api/practices/pr-1/grid": grilla(),
      ...extra,
    }),
  );
  vi.stubGlobal("fetch", espia);

  return espia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("La grilla del comisario (T-731)", () => {
  it("se recorre POR JUGADOR: una fila por persona con sus chukkers", async () => {
    // Es la decisión de diseño entera (plan §7). Por celda serían 64 objetivos táctiles en un
    // celular; por jugador son dos filas de dos fichas.
    conApi("commissioner");
    montar("/practices/pr-1/grid");

    expect(await screen.findByText("Ana Polo")).toBeDefined();
    expect(screen.getByText("Luis Polo")).toBeDefined();
    expect(
      screen.getByRole("button", { name: copy.grilla.jugoChukker("Ana Polo", 1) }),
    ).toBeDefined();
  });

  it("muestra la cuenta de cada quien, que es lo que se mira antes de cerrar", async () => {
    conApi("commissioner");
    montar("/practices/pr-1/grid");

    expect(await screen.findAllByText(copy.grilla.cuenta(2))).toHaveLength(2);
  });

  it("un toque en un chukker lo QUITA, y manda sólo ese cambio", async () => {
    // La corrección más común —«Ana no jugó el cuarto»— es un solo toque en la fila de Ana.
    const espia = conApi("commissioner", {
      "PATCH /api/practices/pr-1/grid": grilla(),
    });
    montar("/practices/pr-1/grid");

    await userEvent.click(
      await screen.findByRole("button", { name: copy.grilla.jugoChukker("Ana Polo", 2) }),
    );

    await waitFor(() => {
      const patch = espia.mock.calls.find(
        (llamada) => (llamada[1] as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patch).toBeDefined();
      expect(JSON.parse((patch?.[1] as RequestInit).body as string)).toEqual({
        cambios: [{ chukker: 2, equipo: "A", position: 1, personId: null }],
      });
    });
  });

  it("las fichas dicen si se jugó o no, para quien no ve el color", async () => {
    // `aria-pressed`: el estado de una ficha no puede vivir sólo en el color de fondo.
    conApi("commissioner");
    montar("/practices/pr-1/grid");

    const ficha = await screen.findByRole("button", {
      name: copy.grilla.jugoChukker("Ana Polo", 1),
    });

    expect(ficha.getAttribute("aria-pressed")).toBe("true");
  });

  it("una práctica sin grilla lo DICE, en vez de quedar en blanco", async () => {
    conApi("commissioner", { "/api/practices/pr-1/grid": { estado: 404 } });
    montar("/practices/pr-1/grid");

    expect(await screen.findByText(copy.grilla.sinGrilla)).toBeDefined();
  });

  it("cerrada, la grilla se ve pero NO se toca", async () => {
    conApi("commissioner", { "/api/practices/pr-1/grid": grilla({ cerrada: true }) });
    montar("/practices/pr-1/grid");

    expect(await screen.findByText(copy.grilla.cerrada)).toBeDefined();
    expect(
      screen.getByRole("button", { name: copy.grilla.jugoChukker("Ana Polo", 1) }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("cerrada, ofrece REABRIR y no cerrar de nuevo", async () => {
    conApi("commissioner", { "/api/practices/pr-1/grid": grilla({ cerrada: true }) });
    montar("/practices/pr-1/grid");

    expect(await screen.findByRole("button", { name: copy.grilla.reabrir })).toBeDefined();
    expect(screen.queryByRole("button", { name: copy.grilla.cerrar })).toBeNull();
  });

  it("marcar ausente manda la persona y la bandera", async () => {
    const espia = conApi("commissioner", {
      "POST /api/practices/pr-1/grid/no-show": grilla(),
    });
    montar("/practices/pr-1/grid");

    await userEvent.click(
      await screen.findByRole("button", { name: copy.grilla.marcarAusente("Ana Polo") }),
    );

    await waitFor(() => {
      const post = espia.mock.calls.find((llamada) =>
        String(llamada[0]).includes("/no-show"),
      );
      expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({
        personId: "p-ana",
        ausente: true,
      });
    });
  });

  it("un ausente no se puede tocar en la grilla: las dos cosas no pueden ser ciertas", async () => {
    conApi("commissioner", {
      "/api/practices/pr-1/grid": grilla({
        chukkersPorPersona: [
          { personId: "p-ana", fullName: "Ana Polo", chukkers: 0, noSePresento: true },
          { personId: "p-luis", fullName: "Luis Polo", chukkers: 2, noSePresento: false },
        ],
        celdas: [
          { chukker: 1, equipo: "A", position: 1, persona: null },
          { chukker: 2, equipo: "A", position: 1, persona: null },
          {
            chukker: 1,
            equipo: "B",
            position: 1,
            persona: { personId: "p-luis", fullName: "Luis Polo" },
          },
          {
            chukker: 2,
            equipo: "B",
            position: 1,
            persona: { personId: "p-luis", fullName: "Luis Polo" },
          },
        ],
      }),
    });
    montar("/practices/pr-1/grid");

    expect(await screen.findByText(copy.grilla.noSePresento)).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: copy.grilla.noJugoChukker("Ana Polo", 1) })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("el botón de cerrar NO se esconde cuando la práctica no empezó: el API dice por qué", async () => {
    // Esconderlo obligaría a la pantalla a saber la hora del club, que es una regla del dominio.
    conApi("commissioner");
    montar("/practices/pr-1/grid");

    expect(await screen.findByRole("button", { name: copy.grilla.cerrar })).toBeDefined();
  });

  it("si el cierre se rechaza, la pantalla muestra el motivo del servidor", async () => {
    conApi("commissioner", {
      "POST /api/practices/pr-1/close": {
        estado: 409,
        cuerpo: {
          error: { code: "todavia_no_empezo", message: "lo que diga el servidor", requestId: "" },
        },
      },
    });
    montar("/practices/pr-1/grid");

    await userEvent.click(await screen.findByRole("button", { name: copy.grilla.cerrar }));

    // El cliente traduce por CÓDIGO y nunca muestra el `message` del servidor (T-122): ese texto
    // se escribió sin saber en qué pantalla iba a salir, y vive fuera de `es-CO.ts`.
    expect(await screen.findByText(copy.errores.todavia_no_empezo)).toBeDefined();
  });
});

describe("La sustitución (T-732)", () => {
  const PERSONAS = {
    estado: 200,
    cuerpo: {
      items: [
        { personId: "p-pedro", fullName: "Pedro Polo", handicap: { halves: 4, goals: "2" } },
        { personId: "p-ana", fullName: "Ana Polo", handicap: { halves: 8, goals: "4" } },
      ],
      total: 2,
      page: 1,
      limit: 200,
    },
  };

  it("traspasa a quien entra LOS CHUKKERS del que sale, en un solo lote", async () => {
    // Es un intercambio: por separado el primero chocaría contra la restricción de la base.
    const espia = conApi("commissioner", {
      "/api/handicaps?limit=200": PERSONAS,
      "PATCH /api/practices/pr-1/grid": grilla(),
    });
    montar("/practices/pr-1/grid");

    await userEvent.click(
      await screen.findByRole("button", { name: copy.grilla.sustituir("Ana Polo") }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Pedro Polo" }));

    await waitFor(() => {
      const patch = espia.mock.calls.find(
        (llamada) => (llamada[1] as RequestInit | undefined)?.method === "PATCH",
      );
      expect(JSON.parse((patch?.[1] as RequestInit).body as string)).toEqual({
        cambios: [
          { chukker: 1, equipo: "A", position: 1, personId: "p-pedro" },
          { chukker: 2, equipo: "A", position: 1, personId: "p-pedro" },
        ],
      });
    });
  });

  it("no se ofrece sustituir a alguien por sí mismo", async () => {
    conApi("commissioner", { "/api/handicaps?limit=200": PERSONAS });
    montar("/practices/pr-1/grid");

    await userEvent.click(
      await screen.findByRole("button", { name: copy.grilla.sustituir("Ana Polo") }),
    );

    expect(await screen.findByRole("button", { name: "Pedro Polo" })).toBeDefined();
    // Ana sale de la lista: sustituirla por ella misma no significa nada.
    expect(screen.queryByRole("button", { name: "Ana Polo" })).toBeNull();
  });

  it("la lista de personas sale del listado del club, NO del de usuarios", async () => {
    // `GET /users` exige `user.edit`, que el comisario no tiene: es el agujero de `specs/030` T-343.
    const espia = conApi("commissioner", { "/api/handicaps?limit=200": PERSONAS });
    montar("/practices/pr-1/grid");

    await userEvent.click(
      await screen.findByRole("button", { name: copy.grilla.sustituir("Ana Polo") }),
    );

    await waitFor(() => {
      expect(espia.mock.calls.some((llamada) => String(llamada[0]).includes("/handicaps"))).toBe(
        true,
      );
    });
    expect(espia.mock.calls.some((llamada) => String(llamada[0]).includes("/users"))).toBe(false);
  });
});
