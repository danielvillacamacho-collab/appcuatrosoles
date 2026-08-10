import type { AccountStatus } from "./accountStatus.js";

/**
 * Motivo por el que se rechaza un inicio de sesión. La capa de presentación traduce cada motivo
 * a un texto de `i18n/es-CO.ts`; el dominio no conoce mensajes.
 */
export type LoginRejection =
  /**
   * Mensaje **genérico**: «correo o contraseña incorrectos». Es el único motivo que se puede
   * mostrar a alguien que no demostró conocer la contraseña, porque cualquier otro revelaría si
   * ese correo tiene cuenta y en qué estado está (P-12, R-010-07).
   */
  | "credentials_invalid"
  | "invitation_pending"
  | "suspended"
  | "archived";

export type LoginOutcome = { allowed: true } | { allowed: false; rejection: LoginRejection };

/** Sólo una cuenta `active` puede iniciar sesión (spec.md §6 R-010-06). */
export function accountStatusAllowsLogin(status: AccountStatus): boolean {
  return status === "active";
}

/**
 * Decide el resultado de un intento de inicio de sesión.
 *
 * **El orden es la regla, y por eso vive aquí y no en el controlador.** Primero se comprueba la
 * contraseña; sólo si es correcta se revela el estado de la cuenta. Al revés —mirar el estado
 * antes— cualquiera podría escribir un correo y averiguar si existe y si está suspendido, que es
 * a la vez enumeración de cuentas y una fuga de datos de un tercero (P-12).
 *
 * El PRD Parte II §5 pide que una cuenta invitada, suspendida o archivada reciba «un mensaje
 * acorde a su estado». Este diseño lo cumple **para su titular legítimo**, que es quien conoce su
 * contraseña, y no para quien está probando correos. Cuando ambas cosas chocan gana la
 * constitución, no el PRD (`memory/constitution.md`, §3).
 *
 * No decide nada sobre el bloqueo por intentos fallidos: eso es T-032, y se evalúa antes de
 * llegar aquí.
 *
 * @param credentialsValid resultado de verificar la contraseña contra el hash Argon2id. El
 *   dominio no hashea ni compara: recibe el veredicto ya tomado, para no depender de una librería.
 */
export function resolveLoginOutcome(input: {
  credentialsValid: boolean;
  status: AccountStatus;
}): LoginOutcome {
  if (!input.credentialsValid) {
    return { allowed: false, rejection: "credentials_invalid" };
  }

  switch (input.status) {
    case "active":
      return { allowed: true };
    case "invited":
      return { allowed: false, rejection: "invitation_pending" };
    case "suspended":
      return { allowed: false, rejection: "suspended" };
    case "archived":
      return { allowed: false, rejection: "archived" };
    default:
      // Si algún día se agrega un estado nuevo, esto deja de compilar y obliga a decidir
      // explícitamente si puede iniciar sesión. Es preferible a que caiga en un `else` y quede
      // permitido —o prohibido— por accidente.
      return exhaustivo(input.status);
  }
}

function exhaustivo(estado: never): never {
  throw new Error(`Estado de cuenta no contemplado: ${String(estado)}`);
}
