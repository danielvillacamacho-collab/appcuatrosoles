import { HttpException } from "@nestjs/common";

/**
 * Un error de negocio con su código estable de contrato (`docs/03` §2).
 *
 * `code` viaja al frontend y **forma parte del contrato**: el cliente puede ramificar sobre él.
 * `message` es texto en español apto para mostrarle al usuario y puede reescribirse sin romper a
 * nadie. Los dos viajan juntos desde aquí para que no puedan desincronizarse: un `code` nuevo sin
 * mensaje, o un mensaje que ya no corresponde al código, son errores que sólo se ven en producción.
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: string,
    status: number,
    readonly userMessage: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(userMessage, status);
  }
}

/**
 * Respuesta por defecto para cada estado HTTP que el API usa (`docs/03` §3).
 *
 * Existe por dos razones. La primera es que NestJS lanza sus propias excepciones —una ruta
 * inexistente, un método no permitido— con mensajes en inglés («Cannot GET /users») que además
 * describen la infraestructura; sin este catálogo, esos textos llegarían tal cual al usuario. La
 * segunda es que centraliza el copy: ningún controlador escribe un mensaje suelto (regla de oro 1
 * de `CLAUDE.md`, aplicada al API — el `es-CO.ts` de `apps/web` cubre la interfaz, no las
 * respuestas del servidor).
 *
 * Los mensajes son deliberadamente parcos. `401` y `404` nunca dicen si algo existe: un recurso de
 * otro club responde `404` igual que uno inexistente, y la diferencia no puede filtrarse por el
 * texto (P-05, P-12, `docs/03` §3).
 */
const RESPUESTA_POR_ESTADO: Record<number, { code: string; message: string }> = {
  400: { code: "VALIDATION_FAILED", message: "Los datos enviados no son válidos." },
  401: { code: "UNAUTHENTICATED", message: "Debes iniciar sesión para continuar." },
  403: { code: "FORBIDDEN", message: "No tienes permiso para realizar esta acción." },
  404: { code: "NOT_FOUND", message: "No encontramos lo que buscas." },
  405: { code: "METHOD_NOT_ALLOWED", message: "Esta operación no está disponible." },
  409: { code: "CONFLICT", message: "La operación no se pudo completar por un conflicto de estado." },
  422: { code: "UNPROCESSABLE", message: "La operación no cumple una regla del club." },
  429: { code: "RATE_LIMITED", message: "Demasiados intentos. Espera un momento y vuelve a intentar." },
};

/**
 * Lo que se responde cuando algo se rompió y no sabemos qué. Nunca lleva el mensaje original: una
 * excepción de infraestructura suele traer nombres de tabla, rutas o fragmentos de consulta, y eso
 * no se le muestra a nadie (`docs/03` §3, `docs/06` §5). Lo que sí viaja es el `requestId`, con el
 * que el reclamo de un usuario se conecta con la traza completa en el log.
 */
export const RESPUESTA_INESPERADA = {
  code: "INTERNAL_ERROR",
  message: "Ocurrió un error inesperado. Vuelve a intentar; si persiste, repórtalo con el código de la solicitud.",
} as const;

export function respuestaPorEstado(status: number): { code: string; message: string } {
  return RESPUESTA_POR_ESTADO[status] ?? RESPUESTA_INESPERADA;
}
