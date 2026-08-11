import { ApiErrorResponse } from "@polo/contracts";

/**
 * El único lugar de la aplicación que habla con el API (T-120, `plan.md` §9.3).
 *
 * Ningún componente ni ningún hook hace `fetch` por su cuenta, y no es una preferencia de estilo:
 * son tres cosas que **hay que hacer siempre** y que, repartidas, alguien va a olvidar.
 *
 * 1. **Las cookies viajan.** La sesión es una cookie `httpOnly` (`ADR-005`) que JavaScript no
 *    puede leer ni adjuntar a mano: sin `credentials: "include"` la petición sale anónima y el
 *    API responde `401` sin que nada en el código lo explique.
 * 2. **El token de CSRF va en toda mutación.** Lo exige un middleware global del API, no un guard
 *    por ruta, así que aplica también a los endpoints que todavía no existen. Si cada
 *    `useMutation` tuviera que acordarse, el día que uno se olvide el síntoma sería un `403`
 *    incomprensible en producción — y sólo en producción, porque en desarrollo se prueba poco el
 *    camino de escritura.
 * 3. **El error se traduce en el borde.** Lo que sale de aquí es `ApiError` con su `code`, nunca
 *    una `Response` cruda: una pantalla que tenga que mirar `response.status` es una pantalla que
 *    va a tratar distinto el mismo problema en dos lugares.
 */

/** La cookie legible que emite el login. Su nombre lo fija el API en `common/auth/csrf.ts`. */
const COOKIE_CSRF = "polo_csrf";
const CABECERA_CSRF = "x-csrf-token";

const VERBOS_MUTANTES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * De dónde cuelga el API.
 *
 * Vacío por defecto —rutas relativas— porque en producción el API y la aplicación viven en el
 * **mismo origen**: el club entra por `losPinos.polo.app` y ahí está todo. Es lo que hace que la
 * cookie de sesión funcione sin `SameSite=None`, y lo que hace que el tenant se resuelva por el
 * `Host` sin que el cliente mande nunca un `clubId` (`ADR-013`, P-05).
 *
 * En desarrollo, Vite hace de proxy hacia el puerto del API. Si algún día hiciera falta un origen
 * distinto, se cambia aquí y en la política de CORS del API, no en cada llamada.
 */
const BASE = import.meta.env.VITE_API_URL ?? "";

export interface ApiErrorData {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown> | undefined;
}

/**
 * Un error que el API contestó *entendiendo* la petición: `401`, `403`, `404`, `409`, `422`.
 *
 * Trae el `code` del contrato, que es lo que las pantallas traducen a español (T-122). El
 * `message` viene también, pero está escrito para quien lee un log — no se muestra en un
 * formulario.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly data: ApiErrorData,
  ) {
    super(`${status} ${data.code}`);
    this.name = "ApiError";
  }
}

/**
 * Un error que impidió siquiera obtener respuesta: sin red, el servidor caído, CORS.
 *
 * Es una clase aparte de `ApiError` porque lo que hay que decirle a la persona es distinto —
 * «revisa tu conexión» y no «no tienes permiso»— y porque reintentar tiene sentido en uno y no en
 * el otro.
 */
export class NetworkError extends Error {
  constructor(readonly causa: unknown) {
    super("No se pudo contactar al servidor");
    this.name = "NetworkError";
  }
}

export interface ApiRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Se serializa a JSON. `undefined` manda la petición sin cuerpo. */
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Hace la petición y devuelve el cuerpo ya parseado.
 *
 * `T` es lo que quien llama espera; **no se valida aquí contra el esquema del contrato** y es a
 * propósito: validar en el cliente HTTP obligaría a pasarle el esquema en cada llamada y
 * convertiría un cambio del API en una pantalla en blanco. Los hooks de cada feature validan lo
 * que necesitan, donde saben qué hacer si no cuadra.
 */
export async function api<T>(path: string, opciones: ApiRequest = {}): Promise<T> {
  const method = opciones.method ?? "GET";
  const cabeceras: Record<string, string> = {};

  if (opciones.body !== undefined) {
    cabeceras["content-type"] = "application/json";
  }

  if (VERBOS_MUTANTES.has(method)) {
    const csrf = leerCookie(COOKIE_CSRF);

    // Sin sesión no hay cookie de CSRF, y el API tampoco la exige: mandar la cabecera vacía sería
    // peor que no mandarla, porque parecería un token inválido.
    if (csrf !== undefined) {
      cabeceras[CABECERA_CSRF] = csrf;
    }
  }

  let respuesta: Response;

  try {
    respuesta = await fetch(`${BASE}${path}`, {
      method,
      // La sesión es una cookie `httpOnly`: sin esto, toda la aplicación estaría anónima.
      credentials: "include",
      headers: cabeceras,
      ...(opciones.body === undefined ? {} : { body: JSON.stringify(opciones.body) }),
      ...(opciones.signal === undefined ? {} : { signal: opciones.signal }),
    });
  } catch (causa) {
    // `AbortError` no es una falla: es una consulta que ya no interesa porque la persona navegó a
    // otro lado. Se deja pasar tal cual para que TanStack Query la reconozca y no la reintente.
    if (causa instanceof DOMException && causa.name === "AbortError") {
      throw causa;
    }

    throw new NetworkError(causa);
  }

  if (!respuesta.ok) {
    throw new ApiError(respuesta.status, await datosDelError(respuesta));
  }

  // `204 No Content` es la respuesta normal de varias mutaciones (cerrar sesión, aceptar la
  // invitación). Llamar a `.json()` sobre un cuerpo vacío revienta con un error de sintaxis que no
  // dice nada sobre lo que pasó.
  if (respuesta.status === 204) {
    return undefined as T;
  }

  return (await respuesta.json()) as T;
}

/**
 * El cuerpo del error, o uno fabricado si no vino con la forma del contrato.
 *
 * Un `502` de un balanceador o una página de error de infraestructura no traen `error.code`, y
 * quien llama no debería tener que distinguir ese caso: recibe un `ApiError` igual, con un código
 * que dice de dónde salió.
 */
async function datosDelError(respuesta: Response): Promise<ApiErrorData> {
  const generico: ApiErrorData = {
    code: "RESPUESTA_INESPERADA",
    message: `El servidor respondió ${respuesta.status}.`,
    requestId: "",
  };

  try {
    const analizado = ApiErrorResponse.safeParse(await respuesta.json());

    return analizado.success ? analizado.data.error : generico;
  } catch {
    return generico;
  }
}

/**
 * Lee una cookie por nombre.
 *
 * `document.cookie` es una sola cadena con todas las cookies legibles separadas por `; `. Se
 * decodifica el valor porque el navegador guarda lo que le pusieron, y el token es hexadecimal
 * hoy pero nada garantiza que lo siga siendo.
 */
function leerCookie(nombre: string): string | undefined {
  const buscado = `${nombre}=`;

  for (const parte of document.cookie.split("; ")) {
    if (parte.startsWith(buscado)) {
      return decodeURIComponent(parte.slice(buscado.length));
    }
  }

  return undefined;
}
