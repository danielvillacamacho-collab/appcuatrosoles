import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { fetchSimulado, montar } from "../../test/montar.js";
import { copy } from "../../i18n/es-CO.js";

const CLUB = { estado: 200, cuerpo: { name: "Club Los Pinos", timezone: "America/Bogota" } };
const YO = {
  estado: 200,
  cuerpo: {
    userAccountId: "u1",
    personId: "p1",
    fullName: "María Fernanda",
    email: "maria@lospinos.test",
    pendingEmail: null,
    phone: null,
    photoKey: null,
    roles: [{ role: "club_admin", scope: "club", scopeId: "c1" }],
    organizations: [{ id: "o1", name: "Escuela de menores", relationship: "staff" }],
    membershipCategory: { code: "socio", name: "Socio activo" },
  },
};

describe("Guard de sesión (T-125)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin sesión manda a la pantalla de ingreso, sin mostrar nada de lo privado", async () => {
    // El `401` de `/me` es la respuesta, no un fallo: significa «no hay sesión». Pintar el panel
    // «optimistamente» y esconderlo después es el parpadeo que deja ver lo que no se debía ver.
    vi.stubGlobal(
      "fetch",
      vi.fn(fetchSimulado({ "/me": { estado: 401, cuerpo: { error: { code: "UNAUTHENTICATED", message: "", requestId: "" } } }, "/clubs/current/public": CLUB })),
    );

    montar("/");

    expect(await screen.findByLabelText(copy.ingreso.contrasena)).toBeDefined();
    expect(screen.queryByText(/María Fernanda/u)).toBeNull();
  });

  it("con sesión deja pasar y pinta el panel", async () => {
    vi.stubGlobal("fetch", vi.fn(fetchSimulado({ "/me": YO, "/clubs/current/public": CLUB })));

    montar("/");

    expect(await screen.findByRole("heading", { name: /María Fernanda/u })).toBeDefined();
  });

  it("si `/me` falla por algo que no es la sesión, lo dice en vez de mandar a ingresar", async () => {
    // Un `500` no significa «no tienes sesión». Tratarlo como tal sacaría a alguien de su cuenta
    // por una falla del servidor, y volvería a sacarlo cada vez que reintentara entrar.
    vi.stubGlobal(
      "fetch",
      vi.fn(fetchSimulado({ "/me": { estado: 500, cuerpo: { error: { code: "INTERNAL_ERROR", message: "", requestId: "x" } } }, "/clubs/current/public": CLUB })),
    );

    montar("/");

    expect((await screen.findByRole("alert")).textContent).toBe(copy.errores.INTERNAL_ERROR);
  });
});

describe("Panel propio (T-127, HU-010-04)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("contesta quién soy, qué puedo hacer y a qué pertenezco", async () => {
    vi.stubGlobal("fetch", vi.fn(fetchSimulado({ "/me": YO, "/clubs/current/public": CLUB })));

    montar("/");

    expect(await screen.findByRole("heading", { name: /María Fernanda/u })).toBeDefined();
    expect(screen.getByText(copy.roles["club_admin"] ?? "")).toBeDefined();
    expect(screen.getByText("Socio activo")).toBeDefined();
    expect(screen.getByText("Escuela de menores")).toBeDefined();
    // El nombre del club llega en su propia consulta: puede aparecer después del panel.
    expect(await screen.findByText("Club Los Pinos")).toBeDefined();
  });

  it("a quien todavía no tiene rol le dice qué hacer, en vez de dejarle un hueco", async () => {
    // Le pasa a quien acaba de aceptar la invitación y el club no le asignó nada todavía. Un
    // espacio en blanco ahí parece un error de la plataforma.
    const sinRoles = { estado: 200, cuerpo: { ...YO.cuerpo, roles: [], membershipCategory: null } };
    vi.stubGlobal("fetch", vi.fn(fetchSimulado({ "/me": sinRoles, "/clubs/current/public": CLUB })));

    montar("/");

    expect(await screen.findByText(copy.panel.sinRoles)).toBeDefined();
    expect(screen.getByText(copy.panel.sinCategoria)).toBeDefined();
  });

  it("cerrar sesión devuelve a la pantalla de ingreso", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        fetchSimulado({
          "/me": YO,
          "/clubs/current/public": CLUB,
          "POST /auth/logout": { estado: 204 },
        }),
      ),
    );

    montar("/");
    await userEvent.setup().click(await screen.findByRole("button", { name: copy.comun.salir }));

    await waitFor(() => {
      expect(screen.getByLabelText(copy.ingreso.contrasena)).toBeDefined();
    });
  });
});
