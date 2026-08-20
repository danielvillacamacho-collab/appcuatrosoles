import { SESv2Client } from "@aws-sdk/client-sesv2";
import type { Clock } from "@polo/domain";
import { logger } from "../logging/logger.js";
import { MailerDeArchivo } from "./file-mailer.js";
import type { Mailer } from "./mailer.port.js";
import { resolverConfiguracionDeMailer } from "./mailer.selection.js";
import { SesMailer } from "./ses-mailer.js";

/**
 * Construye el adaptador de correo que corresponda al entorno.
 *
 * La decisión vive en `mailer.selection.ts` (pura y probada); aquí sólo se instancia lo elegido.
 * Si la configuración es inválida, esto lanza y la aplicación **no arranca**: un servidor que
 * responde pero se come los correos es peor que uno que no levanta, porque nadie se entera.
 */
export function construirMailer(clock: Clock, env = process.env): Mailer {
  const configuracion = resolverConfiguracionDeMailer(env);

  if (configuracion.adaptador === "file") {
    // En producción sólo se llega aquí con MAILER=file explícito, y conviene que quede a la vista
    // en los logs de arranque: es un modo de prueba, no una configuración de operación.
    if (env.NODE_ENV === "production") {
      logger.warn(
        "MAILER=file en producción: los correos se escriben a disco y nadie los recibe. " +
          "Es intencional sólo si estás probando.",
      );
    }
    return new MailerDeArchivo(clock);
  }

  logger.info(
    { region: configuracion.region, remitente: configuracion.remitente },
    "correo por Amazon SES",
  );

  return new SesMailer(
    // Sin `credentials`: la cadena por defecto resuelve al rol de la instancia. Ver `ses-mailer.ts`.
    new SESv2Client({ region: configuracion.region }),
    configuracion.remitente,
  );
}
