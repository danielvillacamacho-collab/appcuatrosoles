import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, api } from "../api-client.js";

const CABECERA_CSRF = "x-csrf-token";

function respuesta(estado: number, cuerpo?: unknown): Response {
  if (estado === 204) {
    return new Response(null, { status: 204 });
  }

  return new Response(JSON.stringify(cuerpo ?? {}), {
    status: estado,
    headers: { "content-type": "application/json" },
  });
}

function errorDelApi(code: string): unknown {
  return { error: { code, message: "Un mensaje escrito para el log.", requestId: "abc-123" } };
}

/** La última llamada a `fetch`, con sus cabeceras ya legibles. */
function llamada(espia: ReturnType<typeof vi.fn>): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = espia.mock.calls.at(-1) as [string, RequestInit];

  return { url, init, headers: new Headers(init.headers) };
}

describe("api · lo que tiene que pasar en TODA petición", () => {
  let espia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Una `Response` sólo se puede leer una vez, así que se fabrica una nueva por llamada: con
    // `mockResolvedValue` el segundo test del bucle fallaría por el arnés y no por el cliente.
    espia = vi.fn().mockImplementation(() => Promise.resolve(respuesta(200, { ok: true })));
    vi.stubGlobal("fetch", espia);
    document.cookie = "polo_csrf=un-token-de-csrf";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "polo_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("manda las cookies: sin eso, toda la aplicación estaría anónima", async () => {
    // La sesión es una cookie `httpOnly` que JavaScript no puede leer ni adjuntar a mano. Sin
    // `credentials: "include"` el API responde 401 y nada en el código lo explica.
    await api("/me");

    expect(llamada(espia).init.credentials).toBe("include");
  });

  it("adjunta el token de CSRF en toda mutación", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      await api("/algo", { method });

      expect(llamada(espia).headers.get(CABECERA_CSRF)).toBe("un-token-de-csrf");
    }
  });

  it("no lo manda en una lectura: un GET no cambia nada", async () => {
    await api("/me");

    expect(llamada(espia).headers.get(CABECERA_CSRF)).toBeNull();
  });

  it("sin cookie de CSRF no manda la cabecera vacía: parecería un token inválido", async () => {
    // Sin sesión no hay cookie, y el API tampoco exige el token. Mandar una cabecera vacía sería
    // peor que no mandarla: se rechazaría por inválida en vez de dejarse pasar.
    document.cookie = "polo_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";

    await api("/auth/login", { method: "POST", body: { email: "a@b.co" } });

    expect(llamada(espia).headers.has(CABECERA_CSRF)).toBe(false);
  });

  it("serializa el cuerpo como JSON y lo anuncia", async () => {
    await api("/users", { method: "POST", body: { fullName: "María" } });

    const { init, headers } = llamada(espia);

    expect(headers.get("content-type")).toBe("application/json");
    expect(init.body).toBe('{"fullName":"María"}');
  });

  it("una petición sin cuerpo no anuncia un tipo de contenido que no existe", async () => {
    await api("/auth/logout", { method: "POST" });

    const { init, headers } = llamada(espia);

    expect(init.body).toBeUndefined();
    expect(headers.has("content-type")).toBe(false);
  });
});

describe("api · lo que devuelve", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devuelve el cuerpo ya parseado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(200, { fullName: "María" })));

    await expect(api<{ fullName: string }>("/me")).resolves.toEqual({ fullName: "María" });
  });

  it("un 204 no revienta al intentar parsear un cuerpo vacío", async () => {
    // Es la respuesta normal de cerrar sesión y de aceptar la invitación. Llamar a `.json()` sobre
    // un cuerpo vacío falla con un error de sintaxis que no dice nada sobre lo que pasó.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(204)));

    await expect(api("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});

describe("api · los errores, traducidos en el borde", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("un error del API llega con su código de contrato, no como una respuesta cruda", async () => {
    // Una pantalla que tenga que mirar `response.status` es una pantalla que va a tratar distinto
    // el mismo problema en dos lugares.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(409, errorDelApi("email_en_uso"))));

    await expect(api("/users", { method: "POST", body: {} })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      data: { code: "email_en_uso", requestId: "abc-123" },
    });
  });

  it("distingue el 401 del 422: son dos cosas distintas para quien mira la pantalla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(401, errorDelApi("UNAUTHENTICATED"))));

    const fallo = await api("/me").catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBe(401);
  });

  it("una respuesta que no cumple el contrato igual llega como ApiError", async () => {
    // Un 502 de un balanceador, o la página de error de la infraestructura: quien llama no debería
    // tener que distinguir ese caso.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })));

    await expect(api("/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      data: { code: "RESPUESTA_INESPERADA" },
    });
  });

  it("quedarse sin red no es lo mismo que no tener permiso", async () => {
    // Lo que hay que decirle a la persona es distinto, y reintentar sólo tiene sentido en uno.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(api("/me")).rejects.toBeInstanceOf(NetworkError);
  });

  it("cancelar una consulta no es un fallo: se deja pasar tal cual", async () => {
    // Pasa cada vez que alguien navega antes de que llegue la respuesta. Envolverlo en
    // `NetworkError` haría que TanStack Query lo reintentara y que la pantalla mostrara un error
    // por algo que la persona misma provocó al moverse.
    const abortada = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortada));

    await expect(api("/me")).rejects.toBe(abortada);
  });
});
