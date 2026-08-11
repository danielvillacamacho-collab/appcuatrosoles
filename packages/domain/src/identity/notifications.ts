/**
 * Avisos que el sistema envía por correo (`plan.md` §5 de `specs/010`).
 *
 * Están en el dominio y no en la infraestructura porque **cuál se puede apagar es una regla**, no
 * un detalle del transporte.
 */
export const NOTIFICATION_TYPES = [
  "identity.send-invitation",
  "identity.send-password-reset",
  "identity.notify-password-changed",
  "identity.notify-account-status-changed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Los avisos que **nunca** se apagan (`docs/06`, `notifications.security_always_sent`).
 *
 * «Tu contraseña cambió» y «tu cuenta fue suspendida» son la única señal que recibe alguien a quien
 * le pasó algo que no pidió. Una preferencia que los silencie no es una preferencia: es la forma de
 * que un secuestro de cuenta pase inadvertido.
 *
 * La invitación y el restablecimiento también son innegociables, por otra razón: no son avisos sino
 * **el mecanismo mismo** — apagarlos deja a la persona sin poder entrar.
 */
const SIEMPRE_SE_ENVIAN: readonly NotificationType[] = [
  "identity.send-invitation",
  "identity.send-password-reset",
  "identity.notify-password-changed",
  "identity.notify-account-status-changed",
];

export function esAvisoInevitable(tipo: string): boolean {
  return SIEMPRE_SE_ENVIAN.includes(tipo as NotificationType);
}

/**
 * ¿Se le manda este aviso a esta persona?
 *
 * **Sin preferencia guardada, se manda.** Es una lista de exclusiones y no de inclusiones: al revés
 * —tener que activar cada aviso— la gente se queda sin enterarse de nada y culpa a la plataforma.
 *
 * Hoy los cuatro avisos del módulo son inevitables, así que esta función siempre dice que sí. No es
 * código muerto: es el punto por donde van a pasar los avisos de prácticas, clases y copas, y
 * dejarlo escrito ahora es lo que evita que cada módulo invente su propia regla.
 */
export function debeEnviarse(tipo: string, preferencias: { type: string; enabled: boolean }[]): boolean {
  if (esAvisoInevitable(tipo)) {
    return true;
  }

  const preferencia = preferencias.find((candidata) => candidata.type === tipo);

  return preferencia === undefined || preferencia.enabled;
}
