import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../api-client.js";
import { crearQueryClient } from "../../lib/query-client.js";

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
