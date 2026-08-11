import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchSimulado, montar, type RespuestaSimulada } from "../../test/montar.js";
import { copy } from "../../i18n/es-CO.js";

const CLUB = { estado: 200, cuerpo: { name: "Club Los Pinos", timezone: "America/Bogota" } };
const ADMIN: RespuestaSimulada = {
  estado: 200,
  cuerpo: {
    userAccountId: "u1",
    personId: "p1",
    fullName: "Administradora",
    email: "admin@lospinos.test",
    pendingEmail: null,
    phone: null,
    photoKey: null,
    roles: [{ role: "club_admin", scope: "club", scopeId: "c1" }],
    organizations: [],
    membershipCategory: null,
  },
};

function cancha(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "f1", name: "Cancha 1", surface: "Grama", capacityNotes: null, status: "active", ...extra };
}

function conApi(extra: Record<string, RespuestaSimulada | (() => RespuestaSimulada)>): ReturnType<typeof vi.fn> {
  const espia = vi.fn(
    fetchSimulado({ "/api/clubs/current/public": CLUB, "/api/me": ADMIN, ...extra }),
  );
  vi.stubGlobal("fetch", espia);

  return espia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Canchas (T-461)", () => {
  it("lista las canchas con su estado, incluidas las archivadas y su porqué", async () => {
    conApi({
      "/api/fields?incluirArchivadas=true": {
        estado: 200,
        cuerpo: [cancha(), cancha({ id: "f2", name: "Cancha vieja", status: "archived" })],
      },
    });
    montar("/fields");

    expect(await screen.findByText("Cancha 1")).toBeDefined();
    expect(screen.getByText("Cancha vieja")).toBeDefined();
    // La archivada no desaparece: dice por qué ya no se puede programar en ella.
    expect(screen.getByText(copy.canchas.archivadaAviso)).toBeDefined();
  });

  it("una archivada no ofrece ninguna acción: no hay vuelta atrás que prometer", async () => {
    conApi({
      "/api/fields?incluirArchivadas=true": {
        estado: 200,
        cuerpo: [cancha({ status: "archived" })],
      },
    });
    montar("/fields");

    await screen.findByText("Cancha 1");
    expect(screen.queryByRole("button", { name: copy.canchas.archivar })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.canchas.reactivar })).toBeNull();
  });

  it("crea una cancha y refresca la lista", async () => {
    const espia = conApi({
      "/api/fields?incluirArchivadas=true": { estado: 200, cuerpo: [] },
      "POST /api/fields": { estado: 201, cuerpo: cancha({ name: "Cancha 4" }) },
    });
    const persona = userEvent.setup();
    montar("/fields");

    await persona.click(await screen.findByRole("button", { name: copy.canchas.nueva }));
    await persona.type(screen.getByLabelText(copy.canchas.nombre), "Cancha 4");
    await persona.click(screen.getByRole("button", { name: copy.canchas.crear }));

    await waitFor(() => {
      const enviada = espia.mock.calls.find(
        ([url, init]) => url === "/api/fields" && (init as RequestInit | undefined)?.body !== undefined,
      );
      expect(JSON.parse((enviada?.[1] as RequestInit).body as string)).toEqual({ name: "Cancha 4" });
    });
  });

  it("el nombre repetido se explica con el texto del club", async () => {
    conApi({
      "/api/fields?incluirArchivadas=true": { estado: 200, cuerpo: [cancha()] },
      "POST /api/fields": {
        estado: 409,
        cuerpo: { error: { code: "nombre_de_cancha_en_uso", message: "srv", requestId: "a" } },
      },
    });
    const persona = userEvent.setup();
    montar("/fields");

    await persona.click(await screen.findByRole("button", { name: copy.canchas.nueva }));
    await persona.type(screen.getByLabelText(copy.canchas.nombre), "Cancha 1");
    await persona.click(screen.getByRole("button", { name: copy.canchas.crear }));

    expect((await screen.findAllByRole("alert")).map((alerta) => alerta.textContent)).toContain(
      copy.errores.nombre_de_cancha_en_uso,
    );
  });

  it("poner en mantenimiento manda el PATCH con el estado", async () => {
    const espia = conApi({
      "/api/fields?incluirArchivadas=true": { estado: 200, cuerpo: [cancha()] },
      "PATCH /api/fields/f1": { estado: 200, cuerpo: cancha({ status: "maintenance" }) },
    });
    const persona = userEvent.setup();
    montar("/fields");

    await persona.click(await screen.findByRole("button", { name: copy.canchas.ponerEnMantenimiento }));

    await waitFor(() => {
      const enviada = espia.mock.calls.find(
        ([url, init]) => url === "/api/fields/f1" && (init as RequestInit | undefined)?.body !== undefined,
      );
      expect(JSON.parse((enviada?.[1] as RequestInit).body as string)).toEqual({ status: "maintenance" });
    });
  });
});
