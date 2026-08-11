import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ForbiddenException } from "@nestjs/common";
import { COOKIE_DE_SESION, hashDeTokenDeSesion } from "./session-token.js";

/** Cookie legible por JavaScript: el frontend la lee para devolverla en la cabecera. */
export const COOKIE_CSRF = "polo_csrf";
export const CABECERA_CSRF = "x-csrf-token";

/** Los verbos que cambian datos. Un `GET` no se protege: no debería cambiar nada. */
const VERBOS_MUTANTES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * El token de CSRF de una sesión: `HMAC(secreto, hash del token de sesión)`.
 *
 * **Es doble envío *firmado*, no doble envío a secas** (`docs/06` §1), y la diferencia importa por
 * nuestra topología. Un subdominio por club (ADR-013) significa que `otro-club.polo.app` puede
 * **escribir** una cookie para `.polo.app` que el navegador enviará también a `mi-club.polo.app`:
 * con doble envío simple —comparar cookie contra cabecera— al atacante le basta con poner el mismo
 * valor en las dos y la comprobación pasa.
 *
 * Derivándolo de la sesión, ese ataque se cae: para calcular un token válido hay que conocer el
 * token de sesión de la víctima, que viaja en una cookie `httpOnly` y no se puede leer desde otro
 * subdominio. Si el atacante sobreescribe la cookie de CSRF, deja de coincidir con la sesión y la
 * solicitud se rechaza.
 */
export function tokenCsrfParaSesion(tokenDeSesion: string): string {
  return createHmac("sha256", secretoDeCsrf()).update(hashDeTokenDeSesion(tokenDeSesion)).digest("hex");
}

/**
 * Protección CSRF por doble envío firmado, aplicada a **toda** mutación (`docs/06` §1, T-025).
 *
 * Es middleware y no un guard a propósito: un guard hay que acordarse de poner en cada controlador,
 * y una protección que depende de que alguien se acuerde no es una protección. Aquí cubre todo lo
 * que se monte de aquí en adelante, incluido lo que todavía no existe.
 *
 * **Sólo exige el token cuando hay sesión.** Sin cookie de sesión no hay autoridad que un tercero
 * pueda usar desde el navegador de la víctima, que es exactamente lo que CSRF explota.
 */
export function csrfMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!VERBOS_MUTANTES.has(req.method)) {
    next();

    return;
  }

  const cookies = (req as Request & { cookies?: Record<string, string | undefined> }).cookies;
  const tokenDeSesion = cookies?.[COOKIE_DE_SESION];

  if (tokenDeSesion === undefined || tokenDeSesion === "") {
    next();

    return;
  }

  const recibido = req.headers[CABECERA_CSRF];
  const esperado = tokenCsrfParaSesion(tokenDeSesion);

  if (typeof recibido !== "string" || !sonIguales(recibido, esperado)) {
    // `403` y no `401`: la sesión es válida, lo que falta es la prueba de que la petición la
    // originó nuestra propia aplicación y no una página de otro sitio.
    throw new ForbiddenException({ code: "CSRF_TOKEN_INVALIDO" });
  }

  next();
}

/**
 * Comparación en tiempo constante. Con `===`, el tiempo que tarda en fallar filtra cuántos
 * caracteres iniciales acertó quien está probando — y aquí lo que se compara es un secreto.
 */
function sonIguales(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * El secreto del HMAC. En producción es obligatorio; en desarrollo hay un valor por defecto para
 * que un clon recién hecho funcione.
 *
 * Que el default sea público no rompe la protección —forjar un token exige además el token de
 * sesión de la víctima, que es `httpOnly`— pero sí quita la segunda capa, así que el despliegue lo
 * define (`docs/07`).
 */
function secretoDeCsrf(): string {
  return process.env.CSRF_SECRET ?? "secreto-de-desarrollo-no-usar-en-produccion";
}
