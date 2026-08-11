import type { Clock } from "../shared/clock.js";
import { err, ok, type Result } from "../shared/result.js";

/**
 * El enlace de invitación tal como el dominio necesita verlo. La fila persistida tendrá además
 * token, destinatario y quién invitó; nada de eso entra en la decisión de vigencia.
 */
export interface InvitationLink {
  /** Momento en que se envió la invitación. Desde aquí se cuenta la ventana de validez. */
  sentAt: Date;
  /** Momento en que se usó para definir contraseña. Nulo mientras no se haya usado. */
  usedAt: Date | null;
}

/**
 * La ventana de validez es **configuración**, no código (P-04): vive en
 * `auth.invitation_link_validity_days` (`docs/08` §9, default 7 en ámbito de plataforma). El
 * dominio no conoce ese número ni de dónde sale; se lo entregan.
 *
 * Consecuencia asumida: si un administrador acorta la ventana, las invitaciones ya enviadas se
 * evalúan contra el valor nuevo. Es lo correcto para una regla de seguridad —endurecerla debe
 * surtir efecto ya, no dentro de siete días— y el peor caso es una invitación de más que hay que
 * reenviar.
 */
export interface InvitationLinkPolicy {
  validityDays: number;
}

export type InvitationLinkDenial =
  /** Ya se usó para definir contraseña. De un solo uso (R-010-08). */
  | "link_already_used"
  /** Pasó la ventana de validez. El administrador debe reenviarla (HU-010-02). */
  | "link_expired";

/** El «día» de la ventana es de 24 horas exactas, no un día calendario: todo se guarda en UTC (P-08). */
const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * La misma regla, con la ventana en milisegundos.
 *
 * Existe porque el enlace de **restablecimiento** dura una hora (`docs/08` §9) y expresarla como
 * fracción de día sería una forma rebuscada de decir lo mismo. La lógica —uso primero, vencimiento
 * después, borde que no concede— es idéntica y vive una sola vez: los dos enlaces son el mismo
 * problema con distinta duración, y separarlos habría sido la manera de que uno de los dos se
 * arreglara sin el otro.
 */
export function isOneTimeLinkValid(
  link: InvitationLink,
  validityMs: number,
  clock: Clock,
): Result<void, InvitationLinkDenial> {
  if (link.usedAt !== null) {
    return err("link_already_used");
  }

  return clock.now().getTime() >= link.sentAt.getTime() + validityMs ? err("link_expired") : ok(undefined);
}

/**
 * ¿Sirve todavía este enlace de invitación? (R-010-08, HU-010-02)
 *
 * **Vence al cumplirse la ventana, no un instante después.** En el segundo exacto en que se
 * cumplen los días de validez ya está vencido. Un borde hay que elegirlo, y en un token de acceso
 * se elige por el lado que concede menos.
 *
 * **Se comprueba primero el uso y después el vencimiento**, y el orden importa para la operación:
 * un enlace ya usado seguiría "vencido" con el tiempo, y si respondiéramos «vencido» el
 * administrador lo reenviaría tranquilo sin enterarse de que alguien ya lo consumió — que es
 * justo la señal que querría ver si el correo fue interceptado.
 */
export function isInvitationLinkValid(
  invitation: InvitationLink,
  policy: InvitationLinkPolicy,
  clock: Clock,
): Result<void, InvitationLinkDenial> {
  if (invitation.usedAt !== null) {
    return err("link_already_used");
  }

  const expiraEn = invitation.sentAt.getTime() + policy.validityDays * MILISEGUNDOS_POR_DIA;

  if (clock.now().getTime() >= expiraEn) {
    return err("link_expired");
  }

  return ok(undefined);
}
