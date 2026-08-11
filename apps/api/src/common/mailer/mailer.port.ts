/** Un correo listo para enviar. Sin destinatarios múltiples: no hay ningún caso que los use. */
export interface MensajeDeCorreo {
  para: string;
  asunto: string;
  html: string;
  /** Versión en texto plano. Un correo sin ella cae en carpetas de spam con más facilidad. */
  texto: string;
}

/**
 * Puerto de correo (`docs/01` §4, ADR-008).
 *
 * El adaptador de producción es `SesMailer` y entra cuando se configure la cuenta de AWS. Hasta
 * entonces `MailerDeArchivo` escribe cada mensaje a disco, y eso alcanza para probar el producto de
 * punta a punta en local: quien prueba abre el archivo y hace clic en el enlace de la invitación.
 *
 * **Nada fuera del adaptador sabe cómo se envía un correo.** Es la prueba de que el puerto está
 * bien puesto: cambiar SES por Resend —o por el de archivo— es cambiar un archivo, no perseguir
 * imports por todo el código.
 */
export interface Mailer {
  enviar(mensaje: MensajeDeCorreo): Promise<void>;
}

export const MAILER = Symbol("Mailer");
