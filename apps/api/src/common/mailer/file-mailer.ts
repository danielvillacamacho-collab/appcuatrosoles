import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "@polo/domain";
import { CLOCK } from "../clock/clock.module.js";
import { logger } from "../logging/logger.js";
import type { Mailer, MensajeDeCorreo } from "./mailer.port.js";

/**
 * Adaptador de correo para desarrollo: escribe cada mensaje como un `.html` en disco.
 *
 * **Existe para poder terminar y probar el producto sin depender de AWS.** Quien prueba en local
 * abre el archivo en el navegador y hace clic en el enlace de la invitación, que es exactamente lo
 * que haría con el correo real. `SesMailer` (ADR-008) lo reemplaza cambiando el proveedor del
 * puerto — ni un archivo más.
 *
 * El nombre lleva la marca de tiempo delante para que el más reciente quede último al ordenar, y
 * el destinatario después para poder encontrar «el de María» sin abrirlos todos.
 */
@Injectable()
export class MailerDeArchivo implements Mailer {
  private readonly carpeta = resolve(process.env.MAIL_DIR ?? "./.correos");

  // El reloj inyectado también aquí: P-08 no tiene excepción para «es sólo el nombre del archivo».
  // Y de paso un test puede fijar la hora y saber exactamente cómo se va a llamar.
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async enviar(mensaje: MensajeDeCorreo): Promise<void> {
    await mkdir(this.carpeta, { recursive: true });

    const marca = this.clock.now().toISOString().replace(/[:.]/g, "-");
    const destinatario = mensaje.para.replace(/[^a-z0-9@._-]/gi, "_");
    const ruta = join(this.carpeta, `${marca}__${destinatario}.html`);

    await writeFile(ruta, this.comoDocumento(mensaje), "utf8");

    // Se loguea la ruta, no el contenido: un correo suele traer un enlace con un token de un solo
    // uso, y el log no es el lugar de un secreto (`docs/06` §5).
    logger.info({ para: mensaje.para, asunto: mensaje.asunto, ruta }, "correo escrito a disco");
  }

  /** Se envuelve en un documento completo para que el archivo se abra bien en el navegador. */
  private comoDocumento(mensaje: MensajeDeCorreo): string {
    return [
      "<!doctype html>",
      '<html lang="es"><head><meta charset="utf-8">',
      `<title>${mensaje.asunto}</title></head><body>`,
      `<p style="color:#666"><strong>Para:</strong> ${mensaje.para}<br>`,
      `<strong>Asunto:</strong> ${mensaje.asunto}</p><hr>`,
      mensaje.html,
      "</body></html>",
    ].join("\n");
  }
}
