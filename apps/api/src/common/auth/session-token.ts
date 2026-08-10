import { createHash, randomBytes } from "node:crypto";

/**
 * Nombre de la cookie de sesión. Sin prefijo `__Host-` todavía: ese prefijo exige `Secure` y por
 * lo tanto HTTPS, y el desarrollo local corre en `http://`. Queda como endurecimiento para cuando
 * se configure el despliegue (`docs/07`).
 */
export const COOKIE_DE_SESION = "polo_session";

/** 256 bits de aleatoriedad criptográfica: adivinarlo no es una amenaza que haya que modelar. */
const BYTES_DE_TOKEN = 32;

/**
 * Crea el token opaco que viaja en la cookie (ADR-005: sesión de servidor, no JWT).
 *
 * `base64url` y no `hex` para que la cookie sea más corta, y sin caracteres que obliguen a
 * codificar nada.
 */
export function crearTokenDeSesion(): string {
  return randomBytes(BYTES_DE_TOKEN).toString("base64url");
}

/**
 * Lo que se guarda en `session.token_hash`. **El token en claro nunca toca la base de datos**: si
 * un respaldo o un `SELECT` se filtran, las sesiones activas no son secuestrables (`schema.prisma`,
 * modelo `Session`).
 *
 * SHA-256 y no Argon2id, a diferencia de las contraseñas, y la diferencia es deliberada: Argon2
 * existe para hacer costoso adivinar un secreto **de baja entropía** que eligió una persona. Este
 * token son 256 bits aleatorios —no hay diccionario que probar— y en cambio se verifica en cada
 * solicitud: un hash costoso aquí sería una negación de servicio contra nosotros mismos.
 */
export function hashDeTokenDeSesion(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
