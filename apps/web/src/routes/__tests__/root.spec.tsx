import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { ApiError, NetworkError } from "../../lib/api-client.js";
import { crearQueryClient } from "../__root.js";
import { routeTree } from "../../routeTree.gen.js";

function montar(ruta: string): void {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [ruta] }),
  });

  // El tipo del router de prueba no es el registrado globalmente; lo que se prueba es que el árbol
  // de rutas monta, no la inferencia de tipos, que ya la comprueba `tsc`.
  render(<RouterProvider router={router as never} />);
}

describe("La aplicación monta (T-121)", () => {
  it("renderiza la ruta raíz con su copy centralizado", async () => {
    montar("/");

    expect(await screen.findByRole("heading", { name: "Cuatro Soles" })).toBeDefined();
  });
});

describe("La configuración de TanStack Query (T-121)", () => {
  const opciones = crearQueryClient().getDefaultOptions();
  const reintentar = opciones.queries?.retry;
  const decide = (error: Error, intentos = 0): boolean =>
    typeof reintentar === "function" ? reintentar(intentos, error) : false;

  it("no reintenta un error del API: un 403 no mejora repitiéndolo", () => {
    // Es la respuesta correcta a lo que se pidió. Reintentar sólo suma latencia y ruido en el log.
    const prohibido = new ApiError(403, { code: "FORBIDDEN", message: "", requestId: "" });

    expect(decide(prohibido)).toBe(false);
  });

  it("tampoco un 401: la sesión terminó y hay que ir a la pantalla de ingreso", () => {
    const sinSesion = new ApiError(401, { code: "UNAUTHENTICATED", message: "", requestId: "" });

    expect(decide(sinSesion)).toBe(false);
  });

  it("pero sí reintenta una vez cuando falló el camino, no la regla", () => {
    const sinRed = new NetworkError(new TypeError("Failed to fetch"));

    expect(decide(sinRed, 0)).toBe(true);
    expect(decide(sinRed, 1)).toBe(false);
  });

  it("ninguna mutación se reintenta: repetir un POST crea dos de todo", () => {
    // Dos usuarios, dos cobros, dos inscripciones. Un `POST` que quizá sí llegó no se repite.
    expect(opciones.mutations?.retry).toBe(false);
  });

  it("las consultas no se repiten al volver a una pantalla recién vista", () => {
    expect(opciones.queries?.staleTime).toBe(30_000);
  });
});
