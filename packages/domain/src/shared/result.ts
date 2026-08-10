/**
 * docs/01-architecture.md §3 — el dominio usa Result para errores esperables de negocio.
 * Una excepción queda reservada para lo inesperado (infraestructura caída); un handicap
 * fuera de rango, un cupo lleno o un token vencido son resultados, no excepciones.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T, E = never>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<E, T = never>(error: E): Result<T, E> {
  return { ok: false, error };
}
