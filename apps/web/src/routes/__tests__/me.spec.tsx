import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchSimulado, montar, type RespuestaSimulada } from "../../test/montar.js";
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
    phone: "+57 300 111 2222",
    photoKey: null,
    roles: [{ role: "player", scope: "club", scopeId: "c1" }],
    organizations: [],
    membershipCategory: { code: "socio", name: "Socio activo" },
  },
};

function conApi(rutas: Record<string, RespuestaSimulada | (() => RespuestaSimulada)>): ReturnType<typeof vi.fn> {
  const espia = vi.fn(fetchSimulado({ "/api/clubs/current/public": CLUB, "/api/me": YO, ...rutas }));
  vi.stubGlobal("fetch", espia);

  return espia;
}

/**
 * El cuerpo de la última llamada a esa ruta **que llevaba cuerpo**.
 *
 * Filtrar por cuerpo y no sólo por ruta importa: casi toda pantalla hace primero un `GET` a la
 * misma dirección que después muta, y quedarse con la primera coincidencia devuelve la lectura.
 */
function cuerpoDe(espia: ReturnType<typeof vi.fn>, url: string): unknown {
  const conCuerpo = espia.mock.calls.filter(
    ([pedida, init]) => pedida === url && (init as RequestInit | undefined)?.body !== undefined,
  );

  return JSON.parse((conCuerpo.at(-1)?.[1] as RequestInit).body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Mi perfil (T-130, HU-010-07)", () => {
  it("separa lo que administra el club de lo que cambia su titular", async () => {
    // Sin la distinción, alguien intenta corregir su categoría de membresía, no puede, y concluye
    // que la plataforma está rota. Lo que no se edita ni siquiera se presenta como campo.
    conApi({});
    montar("/me/profile");

    expect(await screen.findByText(copy.perfil.soloLectura)).toBeDefined();
    expect(screen.getByText("Socio activo")).toBeDefined();
    expect(screen.getByText("María Fernanda")).toBeDefined();

    // El teléfono sí es un campo; el nombre y la categoría no.
    expect(screen.getByLabelText(copy.perfil.telefono)).toBeDefined();
    expect(screen.queryByLabelText(copy.perfil.categoria)).toBeNull();
  });

  it("guarda el teléfono", async () => {
    const espia = conApi({ "PATCH /api/me": { estado: 200, cuerpo: { ...YO.cuerpo, phone: "+57 301 000 0000" } } });
    const persona = userEvent.setup();
    montar("/me/profile");

    const telefono = await screen.findByLabelText(copy.perfil.telefono);
    await persona.clear(telefono);
    await persona.type(telefono, "+57 301 000 0000");
    await persona.click(screen.getByRole("button", { name: copy.comun.guardar }));

    await waitFor(() => {
      expect(cuerpoDe(espia, "/api/me")).toEqual({ phone: "+57 301 000 0000" });
    });
  });

  it("borrar el teléfono manda `null`, no una cadena vacía", async () => {
    // Son cosas distintas para el API: «no tengo teléfono» frente a «tengo uno que es «»».
    const espia = conApi({ "PATCH /api/me": { estado: 200, cuerpo: { ...YO.cuerpo, phone: null } } });
    const persona = userEvent.setup();
    montar("/me/profile");

    await persona.clear(await screen.findByLabelText(copy.perfil.telefono));
    await persona.click(screen.getByRole("button", { name: copy.comun.guardar }));

    await waitFor(() => {
      expect(cuerpoDe(espia, "/api/me")).toEqual({ phone: null });
    });
  });

  it("no deja guardar cuando no hay nada que guardar", async () => {
    // Un botón que se puede presionar y no hace nada enseña a desconfiar del botón.
    conApi({});
    montar("/me/profile");

    expect(await screen.findByRole("button", { name: copy.comun.guardar })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("pide la contraseña actual para cambiar el correo de acceso", async () => {
    const espia = conApi({ "POST /api/me/email-change": { estado: 202, cuerpo: { mensaje: "ok" } } });
    const persona = userEvent.setup();
    montar("/me/profile");

    await persona.click(await screen.findByRole("button", { name: copy.perfil.cambiarCorreo }));
    await persona.type(screen.getByLabelText(copy.perfil.correoNuevo), "nueva@lospinos.test");
    await persona.type(screen.getByLabelText(copy.perfil.contrasenaActual), "mi-clave-larga-9");
    await persona.click(screen.getByRole("button", { name: copy.perfil.enviarConfirmacion }));

    await waitFor(() => {
      expect(cuerpoDe(espia, "/api/me/email-change")).toEqual({
        newEmail: "nueva@lospinos.test",
        currentPassword: "mi-clave-larga-9",
      });
    });
  });

  it("avisa que el correo anterior sigue valiendo mientras el nuevo no se confirme", async () => {
    // Sin esto, quien pidió el cambio cree que ya quedó, intenta entrar con el nuevo y no puede.
    conApi({ "/api/me": { estado: 200, cuerpo: { ...YO.cuerpo, pendingEmail: "nueva@lospinos.test" } } });
    montar("/me/profile");

    expect(await screen.findByText(/nueva@lospinos.test/u)).toBeDefined();
    expect(screen.getByText(new RegExp(copy.perfil.pendienteAyuda, "u"))).toBeDefined();
  });
});

describe("Confirmar el correo nuevo (T-130)", () => {
  it("llegar con el token ES la confirmación: no hay botón que presionar", async () => {
    const espia = conApi({ "POST /api/me/email-change/confirm": { estado: 204 } });
    montar("/me/confirm-email?token=del-correo");

    expect(await screen.findByText(copy.confirmarCorreo.listo)).toBeDefined();
    expect(cuerpoDe(espia, "/api/me/email-change/confirm")).toEqual({ token: "del-correo" });
  });

  it("gasta el token UNA sola vez, aunque React monte el componente dos veces", async () => {
    // React 19 en modo estricto monta dos veces en desarrollo. Sin la guarda, el segundo montaje
    // reusaría un token ya consumido y mostraría «este enlace ya no sirve» sobre un cambio que sí
    // funcionó.
    const espia = conApi({ "POST /api/me/email-change/confirm": { estado: 204 } });
    montar("/me/confirm-email?token=del-correo");

    await screen.findByText(copy.confirmarCorreo.listo);

    expect(espia.mock.calls.filter(([url]) => url === "/api/me/email-change/confirm")).toHaveLength(1);
  });

  it("un enlace vencido lo dice, sin dejar la pantalla en «confirmando»", async () => {
    conApi({
      "POST /api/me/email-change/confirm": {
        estado: 422,
        cuerpo: { error: { code: "EMAIL_CHANGE_LINK_INVALID", message: "x", requestId: "a" } },
      },
    });
    montar("/me/confirm-email?token=viejo");

    expect((await screen.findByRole("alert")).textContent).toBe(
      copy.errores.EMAIL_CHANGE_LINK_INVALID,
    );
  });
});

describe("Mis dispositivos (T-131, HU-010-05)", () => {
  const SESIONES = {
    estado: 200,
    cuerpo: [
      {
        id: "s1",
        createdAt: "2026-08-10T15:00:00.000Z",
        lastSeenAt: "2026-08-11T14:00:00.000Z",
        expiresAt: "2026-08-12T15:00:00.000Z",
        userAgent: "Mozilla/5.0 (iPhone)",
        rememberMe: false,
        current: true,
      },
      {
        id: "s2",
        createdAt: "2026-08-01T15:00:00.000Z",
        lastSeenAt: "2026-08-02T14:00:00.000Z",
        expiresAt: "2026-09-01T15:00:00.000Z",
        userAgent: "Mozilla/5.0 (Windows)",
        rememberMe: true,
        current: false,
      },
    ],
  };

  it("marca cuál es esta sesión y no ofrece cerrarla desde la lista", async () => {
    // Cerrarla desde aquí se siente como un accidente; para eso está «cerrar sesión» en el panel.
    conApi({ "/api/me/sessions": SESIONES });
    montar("/me/sessions");

    expect(await screen.findByText(copy.dispositivos.esta)).toBeDefined();
    expect(screen.getAllByRole("button", { name: copy.dispositivos.cerrar })).toHaveLength(1);
  });

  it("cierra una sesión concreta por su identificador", async () => {
    const espia = conApi({ "/api/me/sessions": SESIONES, "DELETE /api/me/sessions/s2": { estado: 204 } });
    const persona = userEvent.setup();
    montar("/me/sessions");

    await persona.click(await screen.findByRole("button", { name: copy.dispositivos.cerrar }));

    await waitFor(() => {
      expect(espia.mock.calls.some(([url]) => url === "/api/me/sessions/s2")).toBe(true);
    });
  });

  it("muestra las fechas en la zona del club, no en UTC", async () => {
    // Una sesión de las 7 p.m. en Bogotá figuraría como del día siguiente si se pintara el UTC
    // crudo. Es el error que más confunde, porque el dato *casi* está bien.
    conApi({ "/api/me/sessions": SESIONES });
    montar("/me/sessions");

    const suya = (await screen.findByText("Mozilla/5.0 (iPhone)")).parentElement;

    // 2026-08-11T14:00Z son las 9:00 a.m. en Bogotá.
    expect(within(suya as HTMLElement).getByText(/9:00/u)).toBeDefined();
  });

  it("«cerrar todas» avisa que incluye ésta", async () => {
    conApi({ "/api/me/sessions": SESIONES });
    montar("/me/sessions");

    expect(await screen.findByText(copy.dispositivos.cerrarTodasAyuda)).toBeDefined();
  });
});

describe("Mis avisos (T-132, T-091)", () => {
  const AVISOS = {
    estado: 200,
    cuerpo: [
      { type: "identity.notify-password-changed", enabled: true, canDisable: false },
      { type: "practice.reminder", enabled: true, canDisable: true },
    ],
  };

  it("muestra los inevitables en vez de esconderlos, y dice por qué", async () => {
    // Esconderlos haría creer que el sistema no los manda: quien recibiera «tu contraseña cambió»
    // después de «apagar todo» pensaría que la plataforma ignora sus preferencias.
    conApi({ "/api/me/notification-preferences": AVISOS });
    montar("/me/notifications");

    const inevitable = await screen.findByLabelText(
      new RegExp(copy.avisos.tipos["identity.notify-password-changed"] ?? "", "u"),
    );

    expect(inevitable).toHaveProperty("disabled", true);
    expect(screen.getByText(new RegExp(copy.avisos.inevitableAyuda, "u"))).toBeDefined();
  });

  it("apagar uno manda sólo ese cambio", async () => {
    const espia = conApi({
      "/api/me/notification-preferences": AVISOS,
      "PATCH /api/me/notification-preferences": {
        estado: 200,
        cuerpo: [
          { type: "identity.notify-password-changed", enabled: true, canDisable: false },
          { type: "practice.reminder", enabled: false, canDisable: true },
        ],
      },
    });
    const persona = userEvent.setup();
    montar("/me/notifications");

    await persona.click(await screen.findByLabelText(/practice.reminder/u));

    await waitFor(() => {
      expect(cuerpoDe(espia, "/api/me/notification-preferences")).toEqual({
        preferences: [{ type: "practice.reminder", enabled: false }],
      });
    });
  });
});

describe("Perfiles a cargo (T-133, HU-010-10)", () => {
  it("contesta quién paga y si puede entrar a la cancha", async () => {
    // Son las dos preguntas que traen a alguien a esta pantalla (R-010-10 y R-010-12).
    conApi({
      "/api/me/dependents": {
        estado: 200,
        cuerpo: [
          {
            personId: "m1",
            fullName: "Tomás",
            birthdate: "2015-03-04",
            isMinor: true,
            status: "active",
            isPrimaryPayer: true,
            membershipCategory: { code: "menor", name: "Menor" },
            waiverAccepted: false,
          },
        ],
      },
    });
    montar("/me/dependents");

    expect(await screen.findByRole("heading", { name: "Tomás" })).toBeDefined();
    expect(screen.getByText(copy.dependientes.pagas)).toBeDefined();
    expect(screen.getByText(copy.dependientes.waiverPendiente)).toBeDefined();
    // La fecha de calendario se arma a mano: `new Date("2015-03-04")` la mostraría un día antes.
    expect(screen.getByText(/04\/03\/2015/u)).toBeDefined();
  });

  it("sin perfiles a cargo lo dice, en vez de una lista vacía sin explicación", async () => {
    conApi({ "/api/me/dependents": { estado: 200, cuerpo: [] } });
    montar("/me/dependents");

    expect(await screen.findByText(copy.dependientes.sinNinguno)).toBeDefined();
  });
});
