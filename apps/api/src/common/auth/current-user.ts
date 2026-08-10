import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

/**
 * Quién está haciendo la solicitud, ya verificado por `SessionGuard`.
 *
 * Lleva `personId` además de `userAccountId` porque son cosas distintas y el proyecto las separa a
 * propósito (`docs/06` §4): la **persona** existe aunque no tenga acceso —un invitado externo, un
 * menor— y la **cuenta** es el acceso. Casi todo lo del polo (handicap, caballos, postulaciones)
 * cuelga de la persona; los permisos cuelgan de la cuenta.
 *
 * No lleva roles: los resuelve `PermissionGuard` (T-022), que es quien los necesita.
 */
export interface SessionUser {
  userAccountId: string;
  personId: string;
  /** Permite cerrar *esta* sesión sin tocar las demás (`DELETE /me/sessions/:id`, T-043). */
  sessionId: string;
}

/** Lo que `SessionGuard` pega al `Request`. */
export interface ConSessionUser {
  sessionUser?: SessionUser;
}

/**
 * `@CurrentUser()` — el usuario de la sesión, en la firma del controlador.
 *
 * Devuelve `undefined` si la ruta no pasó por `SessionGuard`. No lanza: una ruta sin guard es un
 * error de programación que debe verse al escribirla —y a partir de T-022 lo atrapa el arranque de
 * la aplicación—, no un `500` en producción disfrazado de problema de sesión.
 */
export const CurrentUser = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): SessionUser | undefined =>
    contexto.switchToHttp().getRequest<ConSessionUser>().sessionUser,
);
