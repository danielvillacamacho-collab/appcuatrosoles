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

/**
 * Cambio de contraseña estando dentro (T-037).
 *
 * Pide la nueva **dos veces**: no es redundancia, es la única forma de que un error de tipeo no se
 * convierta en «no puedo entrar y no sé por qué». La comparación se hace aquí, en el contrato, para
 * que el servicio reciba una sola contraseña y no tenga que acordarse de comparar.
 */
export const ChangePasswordRequest = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(1),
    newPasswordConfirmation: z.string().min(1),
  })
  .refine((datos) => datos.newPassword === datos.newPasswordConfirmation, {
    message: "Las dos contraseñas nuevas no coinciden.",
    path: ["newPasswordConfirmation"],
  });

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

export const ForgotPasswordRequest = z.object({
  email: z.string().trim().email(),
});

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequest>;

export const ResetPasswordRequest = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(1),
    newPasswordConfirmation: z.string().min(1),
  })
  .refine((datos) => datos.newPassword === datos.newPasswordConfirmation, {
    message: "Las dos contraseñas nuevas no coinciden.",
    path: ["newPasswordConfirmation"],
  });

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;
