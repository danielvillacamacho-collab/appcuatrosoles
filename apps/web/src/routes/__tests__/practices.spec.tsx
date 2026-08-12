import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchSimulado, montar, type RespuestaSimulada } from "../../test/montar.js";
import { copy } from "../../i18n/es-CO.js";

const CLUB = { estado: 200, cuerpo: { name: "Club Los Pinos", timezone: "America/Bogota" } };

function yo(rol: string): RespuestaSimulada {
  return {
    estado: 200,
    cuerpo: {
      userAccountId: "u1",
      personId: "p-yo",
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

function practica(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    targetPlayers: 8,
    minPlayers: 6,
    applicationsCloseAt: "2027-04-10T18:00:00.000Z",
    decisionAt: "2027-04-10T19:00:00.000Z",
    status: "published",
    cancellationReason: null,
    puestosDentro: 3,
    puestosEnEspera: 0,
    abierta: true,
    miPostulacion: null,
    postulados: [],
    ...extra,
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
      "/api/practices": { estado: 200, cuerpo: [practica()] },
      "/api/practices/pr-1": { estado: 200, cuerpo: practica() },
      ...extra,
    }),
  );
  vi.stubGlobal("fetch", espia);

  return espia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("El tablero de prácticas (T-550)", () => {
  it("muestra las prácticas con su cancha y sus cupos", async () => {
    conApi("player");
    montar("/practices");

    expect(await screen.findByText("Cancha 1")).toBeDefined();
    expect(screen.getByText(new RegExp(copy.practicas.cupos(3, 8), "u"))).toBeDefined();
  });

  it("dice «no te has postulado» cuando no lo estás", async () => {
    conApi("player");
    montar("/practices");

    expect(await screen.findByText(copy.practicas.noEstoy)).toBeDefined();
  });

  it("**dice si estás dentro**, que es la pregunta por la que se abre esta pantalla", async () => {
    conApi("player", {
      "/api/practices": {
        estado: 200,
        cuerpo: [
          practica({
            miPostulacion: {
              estado: "dentro",
              posicion: 2,
              chukkersOffered: 4,
              medioHombre: null,
              propuestaRecibida: null,
            },
          }),
        ],
      },
    });
    montar("/practices");

    expect(await screen.findByText(copy.practicas.estoyDentro)).toBeDefined();
  });

  it("y si estás en espera, EN QUÉ POSICIÓN", async () => {
    // «Postulado» a secas deja a la gente sin saber si preparar los caballos.
    conApi("player", {
      "/api/practices": {
        estado: 200,
        cuerpo: [
          practica({
            miPostulacion: {
              estado: "en_espera",
              posicion: 2,
              chukkersOffered: 4,
              medioHombre: null,
              propuestaRecibida: null,
            },
          }),
        ],
      },
    });
    montar("/practices");

    expect(await screen.findByText(copy.practicas.estoyEnEspera(2))).toBeDefined();
  });

  it("un jugador NO ve el botón de crear práctica", async () => {
    conApi("player");
    montar("/practices");

    await screen.findByText("Cancha 1");
    expect(screen.queryByRole("button", { name: copy.practicas.nueva })).toBeNull();
  });

  it("el administrador sí", async () => {
    conApi("club_admin");
    montar("/practices");

    expect(await screen.findByRole("button", { name: copy.practicas.nueva })).toBeDefined();
  });

  it("un tablero vacío lo dice, en vez de quedar en blanco", async () => {
    conApi("player", { "/api/practices": { estado: 200, cuerpo: [] } });
    montar("/practices");

    expect(await screen.findByText(copy.practicas.ninguna)).toBeDefined();
  });
});

describe("El detalle de una práctica (T-551)", () => {
  it("muestra quiénes van, con su estado", async () => {
    conApi("player", {
      "/api/practices/pr-1": {
        estado: 200,
        cuerpo: practica({
          puestosDentro: 2,
          puestosEnEspera: 1,
          postulados: [
            {
              personId: "p-1",
              fullName: "Ana Polo",
              chukkersOffered: 6,
              estado: "dentro",
              posicion: 1,
              companero: null,
            },
            {
              personId: "p-2",
              fullName: "Beto Polo",
              chukkersOffered: 4,
              estado: "en_espera",
              posicion: 1,
              companero: null,
            },
          ],
        }),
      },
    });
    montar("/practices/pr-1");

    // Se busca **dentro de la sección de postulados**: los mismos nombres aparecen también en el
    // desplegable de «comparto puesto con», que es correcto y haría ambigua una búsqueda global.
    const quienesVan = within(
      await screen.findByRole("region", { name: copy.practicas.postulados }),
    );

    expect(quienesVan.getByText("Ana Polo")).toBeDefined();
    expect(quienesVan.getByText("Beto Polo")).toBeDefined();
    expect(quienesVan.getByText(copy.practicas.estoyEnEspera(1))).toBeDefined();
  });

  it("postularse manda los chukkers que la persona puede cubrir", async () => {
    const espia = conApi("player", {
      "POST /api/practices/pr-1/applications": { estado: 204 },
    });
    const persona = userEvent.setup();
    montar("/practices/pr-1");

    const chukkers = await screen.findByLabelText(copy.practicas.chukkersQueCubro);
    await persona.clear(chukkers);
    await persona.type(chukkers, "3");
    await persona.click(screen.getByRole("button", { name: copy.practicas.postularme }));

    await waitFor(() => {
      const enviada = espia.mock.calls.find(
        ([url, init]) =>
          url === "/api/practices/pr-1/applications" &&
          (init as RequestInit | undefined)?.body !== undefined,
      );
      expect(JSON.parse((enviada?.[1] as RequestInit).body as string)).toEqual({
        chukkersOffered: 3,
      });
    });
  });

  it("quien ya está postulado ve retirarse, no postularse", async () => {
    conApi("player", {
      "/api/practices/pr-1": {
        estado: 200,
        cuerpo: practica({
          miPostulacion: {
            estado: "dentro",
            posicion: 1,
            chukkersOffered: 4,
            medioHombre: null,
            propuestaRecibida: null,
          },
        }),
      },
    });
    montar("/practices/pr-1");

    expect(await screen.findByRole("button", { name: copy.practicas.retirarme })).toBeDefined();
    expect(screen.queryByRole("button", { name: copy.practicas.postularme })).toBeNull();
  });

  it("con las postulaciones cerradas no se ofrece ni postularse ni retirarse", async () => {
    // Ofrecer lo que el API va a rechazar es mentir.
    conApi("player", {
      "/api/practices/pr-1": { estado: 200, cuerpo: practica({ abierta: false }) },
    });
    montar("/practices/pr-1");

    await screen.findByText("Cancha 1");
    expect(screen.queryByRole("button", { name: copy.practicas.postularme })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.practicas.retirarme })).toBeNull();
  });

  it("una pareja propuesta y sin aceptar se muestra como pendiente", async () => {
    conApi("player", {
      "/api/practices/pr-1": {
        estado: 200,
        cuerpo: practica({
          miPostulacion: {
            estado: "dentro",
            posicion: 1,
            chukkersOffered: 4,
            medioHombre: { personId: "p-2", fullName: "Beto Polo", aceptada: false },
            propuestaRecibida: null,
          },
        }),
      },
    });
    montar("/practices/pr-1");

    expect(await screen.findByText(copy.practicas.parejaPendiente("Beto Polo"))).toBeDefined();
  });

  it("quien recibió una propuesta ve el botón de aceptarla", async () => {
    conApi("player", {
      "/api/practices/pr-1": {
        estado: 200,
        cuerpo: practica({
          miPostulacion: {
            estado: "dentro",
            posicion: 1,
            chukkersOffered: 4,
            medioHombre: null,
            propuestaRecibida: { personId: "p-2", fullName: "Beto Polo" },
          },
        }),
      },
    });
    montar("/practices/pr-1");

    expect(await screen.findByText(copy.practicas.aceptarPareja("Beto Polo"))).toBeDefined();
    expect(screen.getByRole("button", { name: copy.practicas.aceptar })).toBeDefined();
  });

  it("y quien NO recibió ninguna no ve nada: el bug era decir que uno se propuso a sí mismo", async () => {
    conApi("player", {
      "/api/practices/pr-1": {
        estado: 200,
        cuerpo: practica({
          miPostulacion: {
            estado: "dentro",
            posicion: 1,
            chukkersOffered: 4,
            medioHombre: null,
            propuestaRecibida: null,
          },
        }),
      },
    });
    montar("/practices/pr-1");

    await screen.findByRole("button", { name: copy.practicas.retirarme });
    expect(screen.queryByRole("button", { name: copy.practicas.aceptar })).toBeNull();
  });

  it("un jugador no ve las acciones de administración", async () => {
    conApi("player");
    montar("/practices/pr-1");

    await screen.findByText("Cancha 1");
    expect(screen.queryByRole("button", { name: copy.nuevaPractica.cancelar })).toBeNull();
  });

  it("el administrador ve publicar en un borrador", async () => {
    conApi("club_admin", {
      "/api/practices/pr-1": { estado: 200, cuerpo: practica({ status: "draft", abierta: false }) },
    });
    montar("/practices/pr-1");

    expect(await screen.findByRole("button", { name: copy.nuevaPractica.publicar })).toBeDefined();
  });

  it("«cancha ocupada» al publicar se explica con el texto del club", async () => {
    conApi("club_admin", {
      "/api/practices/pr-1": { estado: 200, cuerpo: practica({ status: "draft", abierta: false }) },
      "POST /api/practices/pr-1/publish": {
        estado: 409,
        cuerpo: { error: { code: "cancha_ocupada", message: "del servidor", requestId: "a" } },
      },
    });
    const persona = userEvent.setup();
    montar("/practices/pr-1");

    await persona.click(await screen.findByRole("button", { name: copy.nuevaPractica.publicar }));

    expect((await screen.findAllByRole("alert")).map((alerta) => alerta.textContent)).toContain(
      copy.errores.cancha_ocupada,
    );
  });
});

describe("Crear una práctica (T-552)", () => {
  it("convierte las horas del club en instantes", async () => {
    // 16:00 en Bogotá son las 21:00 UTC. Armar el instante a mano fijaría el desfase en el código.
    const espia = conApi("club_admin", {
      "/api/fields": {
        estado: 200,
        cuerpo: [
          { id: "f-1", name: "Cancha 1", surface: null, capacityNotes: null, status: "active" },
        ],
      },
      "POST /api/practices": { estado: 201, cuerpo: practica({ status: "draft" }) },
    });
    const persona = userEvent.setup();
    montar("/practices/new");

    const fecha = await screen.findByLabelText(copy.nuevaPractica.fecha);
    await persona.clear(fecha);
    await persona.type(fecha, "2027-04-10");
    await persona.click(screen.getByRole("button", { name: copy.nuevaPractica.crear }));

    await waitFor(() => {
      const enviada = espia.mock.calls.find(
        ([url, init]) =>
          url === "/api/practices" && (init as RequestInit | undefined)?.body !== undefined,
      );
      const cuerpo = JSON.parse((enviada?.[1] as RequestInit).body as string);

      expect(cuerpo.startsAt).toBe("2027-04-10T21:00:00.000Z");
      expect(cuerpo.endsAt).toBe("2027-04-10T23:00:00.000Z");
      expect(cuerpo.fieldId).toBe("f-1");
    });
  });

  it("el rechazo del servidor se explica con el texto del club", async () => {
    conApi("club_admin", {
      "/api/fields": {
        estado: 200,
        cuerpo: [
          { id: "f-1", name: "Cancha 1", surface: null, capacityNotes: null, status: "active" },
        ],
      },
      "POST /api/practices": {
        estado: 422,
        cuerpo: {
          error: {
            code: "practica_minimo_mayor_que_objetivo",
            message: "del servidor",
            requestId: "a",
          },
        },
      },
    });
    const persona = userEvent.setup();
    montar("/practices/new");

    await persona.click(await screen.findByRole("button", { name: copy.nuevaPractica.crear }));

    expect((await screen.findAllByRole("alert")).map((alerta) => alerta.textContent)).toContain(
      copy.errores.practica_minimo_mayor_que_objetivo,
    );
  });
});
