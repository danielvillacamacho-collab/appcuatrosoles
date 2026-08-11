import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    roles: [{ role: "player", scope: "club", scopeId: "c1" }],
    organizations: [],
    membershipCategory: { code: "socio", name: "Socio activo" },
  },
};

function errorDeApi(code: string): unknown {
  return { error: { code, message: "mensaje del servidor", requestId: "abc" } };
}

async function llenarYEntrar(correo = "maria@lospinos.test", clave = "mi-clave-larga-9"): Promise<void> {
  const persona = userEvent.setup();

  await persona.type(await screen.findByLabelText(copy.ingreso.correo), correo);
  await persona.type(screen.getByLabelText(copy.ingreso.contrasena), clave);
  await persona.click(screen.getByRole("button", { name: copy.ingreso.entrar }));
}

describe("Pantalla de ingreso (T-124, HU-010-04)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(fetchSimulado({ "/clubs/current/public": CLUB })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dice de qué club es: quien entra tiene que reconocerlo antes de escribir su contraseña", async () => {
    montar("/login");

    expect(await screen.findByRole("heading", { name: "Club Los Pinos" })).toBeDefined();
  });

  it("los campos tienen etiqueta de verdad, no un placeholder haciendo de etiqueta", async () => {
    // El placeholder desaparece al escribir: un formulario a medio llenar deja de decir qué es
    // cada cosa, y para un lector de pantalla nunca lo dijo.
    montar("/login");

    expect(await screen.findByLabelText(copy.ingreso.correo)).toBeDefined();
    expect(screen.getByLabelText(copy.ingreso.contrasena)).toBeDefined();
    expect(screen.getByLabelText(copy.ingreso.recordarme)).toBeDefined();
  });
});

describe("Pantalla de ingreso · entrar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("manda el correo y la contraseña, y lleva al panel", async () => {
    const espia = vi.fn(
      fetchSimulado({
        "/clubs/current/public": CLUB,
        "POST /auth/login": { estado: 200, cuerpo: { userAccountId: "u1", personId: "p1", fullName: "María Fernanda", email: "maria@lospinos.test" } },
        "/me": YO,
      }),
    );
    vi.stubGlobal("fetch", espia);

    montar("/login");
    await llenarYEntrar();

    await waitFor(() => {
      expect(screen.getByText(/María Fernanda/u)).toBeDefined();
    });

    const login = espia.mock.calls.find(([url]) => url === "/auth/login");
    expect(JSON.parse((login?.[1] as RequestInit).body as string)).toEqual({
      email: "maria@lospinos.test",
      password: "mi-clave-larga-9",
      rememberMe: false,
    });
  });

  it("muestra el error del API en español, no el mensaje del servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        fetchSimulado({
          "/clubs/current/public": CLUB,
          "POST /auth/login": { estado: 401, cuerpo: errorDeApi("CREDENTIALS_INVALID") },
        }),
      ),
    );

    montar("/login");
    await llenarYEntrar();

    const aviso = await screen.findByRole("alert");

    expect(aviso.textContent).toBe(copy.errores.CREDENTIALS_INVALID);
    expect(aviso.textContent).not.toContain("mensaje del servidor");
  });

  it("una cuenta suspendida recibe su motivo, no el error genérico", async () => {
    // El API sólo lo dice a quien acertó la contraseña (T-033 + P-12); la interfaz lo muestra tal
    // cual, porque a esa persona sí le sirve saber a qué atenerse.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        fetchSimulado({
          "/clubs/current/public": CLUB,
          "POST /auth/login": { estado: 401, cuerpo: errorDeApi("ACCOUNT_SUSPENDED") },
        }),
      ),
    );

    montar("/login");
    await llenarYEntrar();

    expect((await screen.findByRole("alert")).textContent).toBe(copy.errores.ACCOUNT_SUSPENDED);
  });

  it("no valida contra el servidor lo que puede validar sola: un correo mal escrito ni sale", async () => {
    const espia = vi.fn(fetchSimulado({ "/clubs/current/public": CLUB }));
    vi.stubGlobal("fetch", espia);

    montar("/login");
    await llenarYEntrar("esto-no-es-un-correo", "mi-clave-larga-9");

    expect(await screen.findByText(copy.ingreso.correoInvalido)).toBeDefined();
    expect(espia.mock.calls.some(([url]) => url === "/auth/login")).toBe(false);
  });

  it("quedarse sin red dice que revise la conexión, no que la contraseña esté mal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/auth/login") {
          return Promise.reject(new TypeError("Failed to fetch"));
        }

        return fetchSimulado({ "/clubs/current/public": CLUB })(url);
      }),
    );

    montar("/login");
    await llenarYEntrar();

    expect((await screen.findByRole("alert")).textContent).toBe(copy.errores.sinRed);
  });
});
