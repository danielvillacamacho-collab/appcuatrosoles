import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Injectable } from "@nestjs/common";
import { logger } from "../logging/logger.js";
import type { Mailer, MensajeDeCorreo } from "./mailer.port.js";

/**
 * Adaptador de correo de producción: Amazon SES (ADR-008).
 *
 * **No recibe llaves de acceso, y es a propósito.** El SDK usa la cadena de credenciales por
 * defecto, que en la EC2 resuelve al rol de la instancia (`infra/terraform/iam.tf` le concede
 * `ses:SendEmail` restringido a `*@<dominio>`). Llaves de larga vida en un `.env` serían peor en
 * todos los sentidos: hay que rotarlas, se filtran en un log, y sobreviven a la instancia que las
 * necesitaba. Si algún día hace falta correr esto fuera de AWS, la misma cadena lee
 * `AWS_ACCESS_KEY_ID` del entorno sin cambiar una línea de aquí.
 *
 * **Lo que este adaptador NO hace: reintentar.** La bandeja de salida ya reintenta con espera
 * creciente y se rinde al quinto intento (`OutboxProcessor`). Si esta clase también reintentara,
 * los dos mecanismos se multiplicarían y un correo podría salir muchas más veces de las previstas.
 * Aquí se falla, y quien llama decide.
 */
@Injectable()
export class SesMailer implements Mailer {
  constructor(
    private readonly cliente: Pick<SESv2Client, "send">,
    /** Debe pertenecer al dominio verificado, o SES rechaza el envío por la política de IAM. */
    private readonly remitente: string,
  ) {}

  async enviar(mensaje: MensajeDeCorreo): Promise<void> {
    const comando = new SendEmailCommand({
      FromEmailAddress: this.remitente,
      Destination: { ToAddresses: [mensaje.para] },
      Content: {
        Simple: {
          Subject: { Data: mensaje.asunto, Charset: "UTF-8" },
          Body: {
            // Las dos partes siempre: un correo sin versión de texto plano cae en spam con más
            // facilidad, y el puerto ya obliga a traerla.
            Html: { Data: mensaje.html, Charset: "UTF-8" },
            Text: { Data: mensaje.texto, Charset: "UTF-8" },
          },
        },
      },
    });

    const respuesta = await this.cliente.send(comando);

    // Se registra el identificador que devuelve SES, no el contenido: un correo suele traer un
    // enlace con un token de un solo uso, y el log no es lugar para un secreto (`docs/06` §5).
    // Ese identificador es lo que permite rastrear un correo en la consola de SES meses después.
    logger.info(
      { para: mensaje.para, asunto: mensaje.asunto, messageId: respuesta.MessageId },
      "correo entregado a SES",
    );
  }
}
