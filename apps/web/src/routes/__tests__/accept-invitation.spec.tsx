import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchSimulado, montar } from "../../test/montar.js";
import { copy } from "../../i18n/es-CO.js";

const CLUB = { estado: 200, cuerpo: { name: "Club Los Pinos", timezone: "America/Bogota" } };
const CON_TOKEN = "/accept-invitation?token=un-token-del-correo";

describe("Aceptar la invitación (T-126, HU-010-02)", () => {
  let espia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    espia = vi.fn(
      fetchSimulado({
        "/clubs/current/public": CLUB,
        "POST /auth/invitation/accept": { estado: 204 },
      }),
    );
    vi.stubGlobal("fetch", espia);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin token no muestra un formulario que no puede funcionar", async () => {
    montar("/accept-invitation");

    expect((await screen.findByRole("alert")).textContent).toBe(copy.invitacion.sinToken);
    expect(screen.queryByLabelText(copy.invitacion.contrasena)).toBeNull();
  });

  it("define la contraseña y manda a ingresar, con el token del enlace", async () => {
    // El API activa la cuenta pero no abre sesión: quien acaba de definir una contraseña debería
    // probarla de una vez, no descubrir mañana que escribió otra cosa.
    const persona = userEvent.setup();
    montar(CON_TOKEN);

    await persona.type(await screen.findByLabelText(copy.invitacion.contrasena), "mi-clave-nueva-7");
    await persona.type(screen.getByLabelText(copy.invitacion.confirmacion), "mi-clave-nueva-7");
    await persona.click(screen.getByRole("button", { name: copy.invitacion.guardar }));

    await waitFor(() => {
      expect(screen.getByLabelText(copy.ingreso.recordarme)).toBeDefined();
    });

    const enviado = espia.mock.calls.find(([url]) => url === "/auth/invitation/accept");
    expect(JSON.parse((enviado?.[1] as RequestInit).body as string)).toMatchObject({
      token: "un-token-del-correo",
      newPassword: "mi-clave-nueva-7",
      newPasswordConfirmation: "mi-clave-nueva-7",
    });
  });

  it("aplica la política de contraseñas ANTES de mandarla: no se pierde lo ya escrito", async () => {
    // Es la misma función del dominio que aplica el API (`validatePassword`), importada. Sin esto,
    // la persona escribe la contraseña dos veces, presiona el botón y recién ahí le dicen que no
    // sirve.
    const persona = userEvent.setup();
    montar(CON_TOKEN);

    await persona.type(await screen.findByLabelText(copy.invitacion.contrasena), "corta1");
    await persona.type(screen.getByLabelText(copy.invitacion.confirmacion), "corta1");
    await persona.click(screen.getByRole("button", { name: copy.invitacion.guardar }));

    await screen.findAllByText(copy.errores.PASSWORD_POLICY);
    expect(espia.mock.calls.some(([url]) => url === "/auth/invitation/accept")).toBe(false);
  });

  it("dos contraseñas distintas se avisan al instante, sin viajar al servidor", async () => {
    const persona = userEvent.setup();
    montar(CON_TOKEN);

    await persona.type(await screen.findByLabelText(copy.invitacion.contrasena), "mi-clave-nueva-7");
    await persona.type(screen.getByLabelText(copy.invitacion.confirmacion), "otra-distinta-8");
    await persona.click(screen.getByRole("button", { name: copy.invitacion.guardar }));

    expect(await screen.findByText(copy.invitacion.noCoinciden)).toBeDefined();
    expect(espia.mock.calls.some(([url]) => url === "/auth/invitation/accept")).toBe(false);
  });

  it("lo que se escribe no se borra solo mientras se llena el formulario", async () => {
    // `values` en vez de `defaultValues` resincroniza el formulario en cada render: con un objeto
    // literal nuevo cada vez, borraría lo que la persona está escribiendo.
    const persona = userEvent.setup();
    montar(CON_TOKEN);

    const nombre = await screen.findByLabelText(copy.invitacion.nombre);
    await persona.type(nombre, "María Fernanda");
    await persona.type(screen.getByLabelText(copy.invitacion.contrasena), "mi-clave-nueva-7");

    expect((nombre as HTMLInputElement).value).toBe("María Fernanda");
  });

  it("un enlace vencido lo dice y explica qué hacer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        fetchSimulado({
          "/clubs/current/public": CLUB,
          "POST /auth/invitation/accept": {
            estado: 422,
            cuerpo: { error: { code: "INVITATION_LINK_INVALID", message: "x", requestId: "a" } },
          },
        }),
      ),
    );

    const persona = userEvent.setup();
    montar(CON_TOKEN);

    await persona.type(await screen.findByLabelText(copy.invitacion.contrasena), "mi-clave-nueva-7");
    await persona.type(screen.getByLabelText(copy.invitacion.confirmacion), "mi-clave-nueva-7");
    await persona.click(screen.getByRole("button", { name: copy.invitacion.guardar }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      copy.errores.INVITATION_LINK_INVALID,
    );
  });
});
