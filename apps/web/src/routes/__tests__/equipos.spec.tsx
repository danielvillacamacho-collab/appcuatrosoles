import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

function puesto(id: string, nombre: string, halves: number, companero?: string): unknown {
  return {
    id,
    position: 1,
    effectiveHandicapHalves: halves,
    titular: { personId: `p-${id}`, fullName: nombre },
    companero: companero === undefined ? null : { personId: `p-${id}b`, fullName: companero },
  };
}

function equipos(extra: Record<string, unknown> = {}): RespuestaSimulada {
  return {
    estado: 200,
    cuerpo: {
      aprobados: false,
      aprobadosAt: null,
      diferenciaHalves: 0,
      equipos: [
        {
          label: "A",
          handicapTotalHalves: 12,
          slots: [puesto("s1", "Ana Polo", 8), puesto("s2", "Beto Polo", 4)],
        },
        {
          label: "B",
          handicapTotalHalves: 12,
          slots: [puesto("s3", "Caro Polo", 6), puesto("s4", "Dani Polo", 6)],
        },
      ],
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
      "/api/practices/pr-1/teams": equipos(),
      ...extra,
    }),
  );
  vi.stubGlobal("fetch", espia);

  return espia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("La pantalla del comisario (T-630)", () => {
  it("muestra los dos equipos con su suma", async () => {
    conApi("commissioner");
    montar("/practices/pr-1/teams");

    const a = within(await screen.findByRole("region", { name: copy.equipos.equipo("A") }));

    expect(a.getByText("Ana Polo")).toBeDefined();
    // 12 medios son 6 goles.
    expect(a.getByText("6")).toBeDefined();
  });

  it("un puesto compartido muestra LOS DOS nombres", async () => {
    // Sin los dos, el número del puesto no se explica (HU-051-03).
    conApi("commissioner", {
      "/api/practices/pr-1/teams": equipos({
        equipos: [
          {
            label: "A",
            handicapTotalHalves: 8,
            slots: [puesto("s1", "Ana Polo", 8, "Beto Polo")],
          },
          { label: "B", handicapTotalHalves: 8, slots: [puesto("s3", "Caro Polo", 8)] },
        ],
      }),
    });
    montar("/practices/pr-1/teams");

    expect(
      await screen.findByText(copy.equipos.compartido("Ana Polo", "Beto Polo")),
    ).toBeDefined();
  });

  it("**mover un jugador cambia la diferencia SIN ir al servidor**", async () => {
    // Es la función entera del asistente de balance: si costara un viaje de red, el comisario
    // dejaría de probar alternativas.
    const espia = conApi("commissioner");
    const persona = userEvent.setup();
    montar("/practices/pr-1/teams");

    expect(await screen.findByText(copy.equipos.parejos)).toBeDefined();

    const antes = espia.mock.calls.length;
    await persona.click(screen.getByRole("button", { name: copy.equipos.mover("Ana Polo") }));

    // 4 contra 20 medios: 8 goles de diferencia.
    expect(await screen.findByText("8")).toBeDefined();
    expect(espia.mock.calls.length, "movió y fue al servidor").toBe(antes);
  });

  it("guardar manda la composición ENTERA", async () => {
    const espia = conApi("commissioner", { "PATCH /api/practices/pr-1/teams": equipos() });
    const persona = userEvent.setup();
    montar("/practices/pr-1/teams");

    await persona.click(
      await screen.findByRole("button", { name: copy.equipos.mover("Ana Polo") }),
    );
    await persona.click(screen.getByRole("button", { name: copy.equipos.guardar }));

    await waitFor(() => {
      const enviada = espia.mock.calls.find(
        ([url, init]) =>
          url === "/api/practices/pr-1/teams" &&
          (init as RequestInit | undefined)?.method === "PATCH",
      );
      const cuerpo = JSON.parse((enviada?.[1] as RequestInit).body as string);

      expect(cuerpo.equipos).toHaveLength(2);
      expect(cuerpo.equipos[0].slotIds).toEqual(["s2"]);
      expect(cuerpo.equipos[1].slotIds).toEqual(["s3", "s4", "s1"]);
    });
  });

  it("sin cambios, guardar está deshabilitado", async () => {
    conApi("commissioner");
    montar("/practices/pr-1/teams");

    const guardar = await screen.findByRole("button", { name: copy.equipos.guardar });

    expect(guardar).toHaveProperty("disabled", true);
  });

  it("avisa que hay cambios sin guardar", async () => {
    conApi("commissioner");
    const persona = userEvent.setup();
    montar("/practices/pr-1/teams");

    await persona.click(
      await screen.findByRole("button", { name: copy.equipos.mover("Ana Polo") }),
    );

    expect(screen.getByText(copy.equipos.cambiosSinGuardar)).toBeDefined();
  });

  it("un refresco con los mismos datos no borra los cambios sin guardar", async () => {
    // **Esto lo garantiza TanStack Query, no código nuestro**, y el test está para que se note si
    // deja de ser cierto: con *structural sharing*, un refresco cuyos datos son iguales devuelve la
    // misma referencia, así que el efecto que sincroniza con el servidor ni se dispara.
    //
    // Llegué a escribir una comparación por valor creyendo que hacía falta. Tres intentos de
    // reproducir el problema fallaron —el test pasaba igual con y sin ella— y eso fue lo que mostró
    // que la guarda no protegía de nada. El refresco se provoca a mano porque, si no, el test no
    // mide lo que dice medir.
    conApi("commissioner");
    const persona = userEvent.setup();
    const pantalla = montar("/practices/pr-1/teams");

    await persona.click(
      await screen.findByRole("button", { name: copy.equipos.mover("Ana Polo") }),
    );
    expect(screen.getByText(copy.equipos.cambiosSinGuardar)).toBeDefined();

    await pantalla.queryClient.invalidateQueries({ queryKey: ["practices", "pr-1"] });
    await new Promise((resolver) => setTimeout(resolver, 200));

    expect(
      screen.queryByText(copy.equipos.cambiosSinGuardar),
      "el refresco se llevó los cambios del comisario",
    ).not.toBeNull();
  });

  it("dice que los jugadores todavía no los ven", async () => {
    conApi("commissioner");
    montar("/practices/pr-1/teams");

    expect(await screen.findByText(copy.equipos.sinAprobar)).toBeDefined();
  });

  it("aprobados, el botón ofrece volver a avisar", async () => {
    conApi("commissioner", {
      "/api/practices/pr-1/teams": equipos({
        aprobados: true,
        aprobadosAt: "2027-04-10T20:00:00.000Z",
      }),
    });
    montar("/practices/pr-1/teams");

    expect(await screen.findByRole("button", { name: copy.equipos.reaprobar })).toBeDefined();
  });

  it("sin equipos todavía, lo dice en vez de quedar en blanco", async () => {
    conApi("commissioner", { "/api/practices/pr-1/teams": { estado: 404, cuerpo: {} } });
    montar("/practices/pr-1/teams");

    expect(await screen.findByText(copy.equipos.sinEquipos)).toBeDefined();
  });
});

describe("Los equipos en el detalle, para el jugador (T-631)", () => {
  const practica = {
    id: "pr-1",
    fieldId: "f-1",
    fieldName: "Cancha 1",
    startsAt: "2027-04-10T21:00:00.000Z",
    endsAt: "2027-04-10T23:00:00.000Z",
    chukkers: 6,
    handicapType: "club",
    suggestedMinHalves: null,
    suggestedMaxHalves: null,
    maxLevelHalves: null,
    targetPlayers: 4,
    minPlayers: 4,
    applicationsCloseAt: "2027-04-10T18:00:00.000Z",
    decisionAt: "2027-04-10T19:00:00.000Z",
    status: "confirmed",
    cancellationReason: null,
    puestosDentro: 4,
    puestosEnEspera: 0,
    abierta: false,
    miPostulacion: null,
    postulados: [],
  };

  function conDetalle(
    rol: string,
    personId: string,
    respuestaDeEquipos: RespuestaSimulada,
  ): ReturnType<typeof vi.fn> {
    const espia = vi.fn(
      fetchSimulado({
        "/api/clubs/current/public": CLUB,
        "/api/me": yo(rol, personId),
        "/api/practices/pr-1": { estado: 200, cuerpo: practica },
        "/api/practices/pr-1/teams": respuestaDeEquipos,
      }),
    );
    vi.stubGlobal("fetch", espia);

    return espia;
  }

  it("un jugador NO ve nada de equipos si no están aprobados", async () => {
    // El API le responde 404 a un borrador (R-051-05): acá no hay nada que esconder.
    conDetalle("player", "p-s1", { estado: 404, cuerpo: {} });
    montar("/practices/pr-1");

    await screen.findByText("Cancha 1");
    expect(screen.queryByRole("heading", { name: copy.equipos.titulo })).toBeNull();
  });

  it("aprobados, los ve con el suyo señalado", async () => {
    conDetalle("player", "p-s1", equipos({ aprobados: true, aprobadosAt: "2027-04-10T20:00:00Z" }));
    montar("/practices/pr-1");

    expect(await screen.findByRole("heading", { name: copy.equipos.titulo })).toBeDefined();
    expect(screen.getByText("Ana Polo")).toBeDefined();
    // Ana Polo es `p-s1`, así que el equipo A es el suyo.
    expect(screen.getByText(copy.equipos.miEquipo)).toBeDefined();
  });

  it("quien no juega ve los dos equipos y ninguno señalado", async () => {
    conDetalle("player", "p-ajeno", equipos({ aprobados: true, aprobadosAt: "2027-04-10T20:00:00Z" }));
    montar("/practices/pr-1");

    expect(await screen.findByRole("heading", { name: copy.equipos.titulo })).toBeDefined();
    expect(screen.queryByText(copy.equipos.miEquipo)).toBeNull();
  });

  it("un jugador no ve el acceso a la pantalla de armar equipos", async () => {
    conDetalle("player", "p-s1", equipos({ aprobados: true, aprobadosAt: "2027-04-10T20:00:00Z" }));
    montar("/practices/pr-1");

    await screen.findByRole("heading", { name: copy.equipos.titulo });
    expect(screen.queryByRole("button", { name: copy.equipos.titulo })).toBeNull();
  });

  it("el comisario sí, incluso sin equipos aprobados todavía", async () => {
    conDetalle("commissioner", "p-com", { estado: 404, cuerpo: {} });
    montar("/practices/pr-1");

    expect(await screen.findByRole("button", { name: copy.equipos.titulo })).toBeDefined();
  });
});

describe("Una práctica confirmada SIN equipos (el callejón que apareció en el navegador)", () => {
  it("ofrece armarlos, en vez de dejar al comisario sin salida", async () => {
    // Una práctica confirmada antes de que existiera este módulo —o confirmada a mano— no tiene
    // propuesta. Sin este botón, el API puede armarlos y la pantalla no ofrece cómo: el mismo
    // agujero que apareció en `specs/030` y en `specs/050`.
    const espia = conApi("commissioner", {
      "/api/practices/pr-1/teams": { estado: 404, cuerpo: {} },
      "POST /api/practices/pr-1/teams/propose": equipos(),
    });
    const persona = userEvent.setup();
    montar("/practices/pr-1/teams");

    await persona.click(await screen.findByRole("button", { name: copy.equipos.armar }));

    await waitFor(() => {
      expect(
        espia.mock.calls.some(([url]) => url === "/api/practices/pr-1/teams/propose"),
      ).toBe(true);
    });
  });
});
