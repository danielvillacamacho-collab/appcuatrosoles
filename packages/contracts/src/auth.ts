import { z } from "zod";

export const LoginRequest = z.object({
  // `.trim()` antes de validar: los teclados de celular agregan un espacio al final con
  // entusiasmo, y rechazar el correo por eso es culpar al usuario de un detalle del teclado. Las
  // mayúsculas las normaliza el servicio al buscar — un correo no distingue mayúsculas.
  email: z.string().trim().email(),
  password: z.string().min(1),
  /** Sesión larga en un dispositivo propio. Ver la nota de duración en `auth.service.ts`. */
  rememberMe: z.boolean().default(false),
});

export type LoginRequest = z.infer<typeof LoginRequest>;

/**
 * Lo que devuelve un inicio de sesión.
 *
 * **No incluye el token de sesión**: ése viaja en una cookie `httpOnly` que JavaScript no puede
 * leer (ADR-005, `docs/06` §1). Devolverlo también en el cuerpo anularía esa protección — bastaría
 * un XSS para llevárselo.
 */
export const LoginResponse = z.object({
  userAccountId: z.string(),
  personId: z.string(),
  fullName: z.string(),
  email: z.string(),
});

export type LoginResponse = z.infer<typeof LoginResponse>;
