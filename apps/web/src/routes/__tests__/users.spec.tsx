import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchSimulado, montar, type RespuestaSimulada } from "../../test/montar.js";
import { copy } from "../../i18n/es-CO.js";

const CLUB = { estado: 200, cuerpo: { name: "Club Los Pinos", timezone: "America/Bogota" } };

/** Quien mira: administradora del club. Su `scopeId` es el club, que es de donde sale su autoridad. */
const ADMIN = {
  estado: 200,
  cuerpo: {
    userAccountId: "admin-1",
    personId: "p-admin",
    fullName: "Administradora",
    email: "admin@lospinos.test",
    pendingEmail: null,
    phone: null,
    photoKey: null,
    roles: [{ role: "club_admin", scope: "club", scopeId: "club-1" }],
    organizations: [],
    membershipCategory: null,
  },
};

function usuario(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "u-1",
    personId: "p-1",
    fullName: "María Fernanda",
    email: "maria@lospinos.test",
    phone: null,
    status: "active",
    invitationSentAt: null,
    roles: [{ id: "r-1", role: "player", scope: "club", scopeId: "club-1" }],
    membershipCategory: { id: "c-1", code: "socio", name: "Socio activo" },
    organizations: [],
    ...extra,
  };
}

function pagina(items: Record<string, unknown>[], total = items.length): RespuestaSimulada {
  return { estado: 200, cuerpo: { items, total, page: 1, limit: 25 } };
}

function conApi(rutas: Record<string, RespuestaSimulada | (() => RespuestaSimulada)>): ReturnType<typeof vi.fn> {
  const espia = vi.fn(
    fetchSimulado({
      "/api/clubs/current/public": CLUB,
      "/api/me": ADMIN,
      "/api/organizations": { estado: 200, cuerpo: [] },
      "/api/membership-categories": { estado: 200, cuerpo: [] },
      ...rutas,
    }),
  );
  vi.stubGlobal("fetch", espia);

  return espia;
}

function urlesPedidas(espia: ReturnType<typeof vi.fn>): string[] {
  return espia.mock.calls.map(([url]) => String(url));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Listado de usuarios (T-134, HU-010-08)", () => {
  it("muestra a la gente del club con su estado", async () => {
    conApi({ "/api/users": pagina([usuario(), usuario({ id: "u-2", fullName: "Pedro", status: "invited" })]) });
    montar("/users");

    // **Cada persona aparece dos veces en el DOM**: como tarjeta y como fila de tabla. En un
    // navegador sólo se ve una —la otra está en `display:none` y ni siquiera llega al lector de
    // pantalla— pero en jsdom no hay CSS que las esconda. Se comprueba que estén las dos formas
    // porque las dos son la pantalla: la del celular y la del monitor.
    expect((await screen.findAllByText("María Fernanda")).length).toBe(2);
    expect(screen.getAllByText("Pedro").length).toBe(2);
    expect(screen.getAllByText(copy.usuarios.estados["invited"] ?? "").length).toBeGreaterThan(0);
  });

  it("en pantalla ancha es una tabla con encabezados, no una pila de tarjetas", async () => {
    // Una tabla de cinco columnas en un celular obliga a desplazar en horizontal; una pila de
    // tarjetas en un monitor desperdicia el espacio que permite comparar de un vistazo.
    conApi({ "/api/users": pagina([usuario()]) });
    montar("/users");

    const tabla = await screen.findByRole("table");

    expect(within(tabla).getByRole("columnheader", { name: copy.usuarios.columnaNombre })).toBeDefined();
    expect(within(tabla).getByRole("columnheader", { name: copy.usuarios.rol })).toBeDefined();
    expect(within(tabla).getByRole("link", { name: "María Fernanda" })).toBeDefined();
  });

  it("los filtros viajan en la URL, no en un estado interno", async () => {
    // Es lo que hace que «mándame el enlace de los invitados que faltan» funcione, que «atrás»
    // devuelva al filtro anterior y que recargar no borre la búsqueda.
    const espia = conApi({ "/api/users": pagina([]), "/api/users?status=invited": pagina([]) });
    const persona = userEvent.setup();
    const pantalla = montar("/users");

    await screen.findByText(copy.usuarios.ninguno);
    await persona.selectOptions(screen.getByLabelText(copy.usuarios.estado), "invited");

    await waitFor(() => {
      expect(urlesPedidas(espia)).toContain("/api/users?status=invited");
    });
    expect(pantalla.ubicacion()).toContain("status=invited");
  });

  it("«Todos» no manda el filtro vacío: eso devolvería cero sin fallar", async () => {
    const espia = conApi({ "/api/users": pagina([usuario()]), "/api/users?status=active": pagina([usuario()]) });
    const persona = userEvent.setup();
    montar("/users");

    const estado = await screen.findByLabelText(copy.usuarios.estado);
    await persona.selectOptions(estado, "active");
    await waitFor(() => expect(urlesPedidas(espia)).toContain("/api/users?status=active"));

    await persona.selectOptions(estado, "");

    await waitFor(() => {
      expect(urlesPedidas(espia).some((url) => url.includes("status="))).toBe(true);
    });
    // La última consulta va sin el parámetro, no con él vacío.
    expect(urlesPedidas(espia).at(-1)).toBe("/api/users");
  });

  it("dice cuántos hay y en qué parte va, no sólo «siguiente»", async () => {
    // Sin el total, nadie sabe si el club tiene treinta socios o tres mil.
    conApi({ "/api/users": { estado: 200, cuerpo: { items: [usuario()], total: 137, page: 1, limit: 25 } } });
    montar("/users");

    expect(await screen.findByText(copy.usuarios.rango(1, 25, 137))).toBeDefined();
  });

  it("no deja retroceder desde la primera página", async () => {
    conApi({ "/api/users": { estado: 200, cuerpo: { items: [usuario()], total: 137, page: 1, limit: 25 } } });
    montar("/users");

    expect(await screen.findByRole("button", { name: copy.usuarios.anterior })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("la exportación es un enlace con los mismos filtros que la tabla", async () => {
    // Un `<a>` y no una llamada de JavaScript: el navegador ya sabe guardar un archivo que llega
    // con `Content-Disposition`.
    conApi({ "/api/users?status=invited": pagina([]) });
    montar("/users?status=invited");

    const enlace = await screen.findByRole("link", { name: copy.usuarios.exportar });

    expect(enlace.getAttribute("href")).toBe("/api/users/export?status=invited");
  });

  it("un filtro sin resultados lo dice, en vez de una tabla vacía sin explicación", async () => {
    conApi({ "/api/users": pagina([]) });
    montar("/users");

    expect(await screen.findByText(copy.usuarios.ninguno)).toBeDefined();
  });
});

describe("Crear o invitar (T-135, HU-010-01 y HU-010-02)", () => {
  it("con el correo alcanza: el nombre es opcional", async () => {
    // El API admite la invitación ligera y la persona completa sus datos al aceptar. Un formulario
    // que exige seis campos para invitar a alguien termina lleno de «Pendiente» y «000».
    const espia = conApi({ "POST /api/users": { estado: 201, cuerpo: usuario() } });
    const persona = userEvent.setup();
    montar("/users/new");

    await persona.type(await screen.findByLabelText(copy.nuevoUsuario.correo), "nueva@lospinos.test");
    await persona.click(screen.getByRole("button", { name: copy.nuevoUsuario.crear }));

    await waitFor(() => {
      const enviada = espia.mock.calls.find(
        ([url, init]) => url === "/api/users" && (init as RequestInit | undefined)?.body !== undefined,
      );
      expect(JSON.parse((enviada?.[1] as RequestInit).body as string)).toEqual({
        email: "nueva@lospinos.test",
        roles: ["player"],
      });
    });
  });

  it("sólo ofrece los roles que quien lo usa puede otorgar (R-010-04)", async () => {
    // Usa `canAssignRole` del dominio, la misma función que aplica el API. Ofrecer un rol que el
    // servidor va a rechazar hace perder el tiempo dos veces.
    conApi({});
    montar("/users/new");

    // Una administradora de club otorga roles de club…
    expect(await screen.findByLabelText(copy.roles["commissioner"] ?? "")).toBeDefined();
    // …y nunca `superadmin`, que es de plataforma.
    expect(screen.queryByLabelText(copy.roles["superadmin"] ?? "")).toBeNull();
  });

  it("un correo ya usado se explica con el texto del club, no con el del servidor", async () => {
    conApi({
      "POST /api/users": {
        estado: 409,
        cuerpo: { error: { code: "email_en_uso", message: "del servidor", requestId: "a" } },
      },
    });
    const persona = userEvent.setup();
    montar("/users/new");

    await persona.type(await screen.findByLabelText(copy.nuevoUsuario.correo), "repetida@lospinos.test");
    await persona.click(screen.getByRole("button", { name: copy.nuevoUsuario.crear }));

    expect((await screen.findByRole("alert")).textContent).toBe(copy.errores.email_en_uso);
  });
});

describe("Ficha de usuario (T-136, HU-010-08)", () => {
  const AUDITORIA = {
    estado: 200,
    cuerpo: [
      {
        id: "a-1",
        action: "user.suspended",
        entityType: "user_account",
        entityId: "p-1",
        actorUserId: "admin-1",
        occurredAt: "2026-08-10T15:00:00.000Z",
        requestId: "req_1",
        before: null,
        after: null,
      },
    ],
  };

  it("muestra el historial de esa persona: «¿quién la suspendió, y cuándo?»", async () => {
    conApi({ "/api/users/u-1": { estado: 200, cuerpo: usuario() }, "/api/audit-log?entityId=p-1": AUDITORIA });
    montar("/users/u-1");

    expect(await screen.findByText("user.suspended")).toBeDefined();
  });

  it("sobre una cuenta activa ofrece suspender y archivar, no reactivar", async () => {
    // Un botón que existe para responder un error es una promesa incumplida.
    conApi({ "/api/users/u-1": { estado: 200, cuerpo: usuario() }, "/api/audit-log?entityId=p-1": { estado: 200, cuerpo: [] } });
    montar("/users/u-1");

    expect(await screen.findByRole("button", { name: copy.fichaUsuario.suspender })).toBeDefined();
    expect(screen.getByRole("button", { name: copy.fichaUsuario.archivar })).toBeDefined();
    expect(screen.queryByRole("button", { name: copy.fichaUsuario.reactivar })).toBeNull();
  });

  it("a una cuenta invitada le ofrece reenviar la invitación", async () => {
    conApi({
      "/api/users/u-1": { estado: 200, cuerpo: usuario({ status: "invited" }) },
      "/api/audit-log?entityId=p-1": { estado: 200, cuerpo: [] },
    });
    montar("/users/u-1");

    expect(await screen.findByRole("button", { name: copy.fichaUsuario.reinvitar })).toBeDefined();
  });

  it("sobre la propia cuenta no ofrece ninguna acción (R-010-05)", async () => {
    // El API lo rechaza igual; aquí no se ofrece, para no prometer algo que va a fallar.
    conApi({
      "/api/users/admin-1": { estado: 200, cuerpo: usuario({ id: "admin-1", personId: "p-admin" }) },
      "/api/audit-log?entityId=p-admin": { estado: 200, cuerpo: [] },
    });
    montar("/users/admin-1");

    expect(await screen.findByText(copy.fichaUsuario.esTuCuenta)).toBeDefined();
    expect(screen.queryByRole("button", { name: copy.fichaUsuario.suspender })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.fichaUsuario.retirar })).toBeNull();
  });

  it("suspender manda la acción y refresca la ficha", async () => {
    const espia = conApi({
      "/api/users/u-1": { estado: 200, cuerpo: usuario() },
      "/api/audit-log?entityId=p-1": { estado: 200, cuerpo: [] },
      "POST /api/users/u-1/suspend": { estado: 200, cuerpo: usuario({ status: "suspended" }) },
    });
    const persona = userEvent.setup();
    montar("/users/u-1");

    await persona.click(await screen.findByRole("button", { name: copy.fichaUsuario.suspender }));

    await waitFor(() => {
      expect(urlesPedidas(espia)).toContain("/api/users/u-1/suspend");
    });
  });
});
