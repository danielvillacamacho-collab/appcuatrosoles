/**
 * Qué adaptador de correo usar, decidido a partir del entorno.
 *
 * Está aparte y es una función pura para poder probar la decisión sin arrancar la aplicación —
 * incluidos los casos que deben **negarse a arrancar**, que son los que importan.
 *
 * ## Por qué esto existe
 *
 * Durante todo el desarrollo el único adaptador fue `MailerDeArchivo`, que escribe cada correo a
 * disco. Es lo correcto en local: se abre el archivo y se hace clic en el enlace de la invitación.
 * Pero quedó conectado **sin condición**, así que el primer despliegue real subió con él: SES ya
 * estaba productivo y la instancia tenía permiso para enviar, y aun así ninguna invitación salía —
 * los correos se escribían dentro del contenedor y desaparecían en el siguiente redespliegue.
 *
 * La lección no es «acordarse de cambiarlo», es que **el ambiente donde hay gente real no puede
 * elegir el adaptador de mentira por omisión**. De ahí la regla de abajo.
 */

export type ConfiguracionDeMailer =
  { adaptador: "file" } | { adaptador: "ses"; remitente: string; region: string };

export class ConfiguracionDeMailerInvalida extends Error {}

const VALORES = ["ses", "file"] as const;

/**
 * Reglas, en orden:
 *
 * 1. `MAILER=ses` → SES. Exige `MAIL_FROM`; sin remitente no hay envío posible, así que se falla al
 *    arrancar y no una vez por cada correo.
 * 2. `MAILER=file` → el de archivo, incluso en producción. Es explícito: alguien lo pidió.
 * 3. `MAILER` sin definir y `NODE_ENV=production` → **no arranca**. Es el caso que causó el
 *    problema: en producción, omitir la decisión no puede significar «tirar los correos a un
 *    archivo».
 * 4. `MAILER` sin definir fuera de producción → el de archivo. Mantiene local, los tests y el CI
 *    funcionando sin configurar nada.
 */
export function resolverConfiguracionDeMailer(
  env: Record<string, string | undefined>,
): ConfiguracionDeMailer {
  const elegido = env.MAILER?.trim().toLowerCase();

  if (elegido === undefined || elegido === "") {
    if (env.NODE_ENV === "production") {
      throw new ConfiguracionDeMailerInvalida(
        "Falta la variable MAILER y NODE_ENV=production. En producción hay que decidir " +
          "explícitamente cómo se envía el correo: MAILER=ses para enviar de verdad por Amazon " +
          "SES (requiere MAIL_FROM), o MAILER=file para escribirlo a disco a propósito. Sin " +
          "definirla, las invitaciones y los restablecimientos de contraseña se escribirían en un " +
          "archivo dentro del contenedor y nadie los recibiría.",
      );
    }
    return { adaptador: "file" };
  }

  if (!(VALORES as readonly string[]).includes(elegido)) {
    throw new ConfiguracionDeMailerInvalida(
      `MAILER=${elegido} no es un valor válido. Los valores posibles son: ${VALORES.join(", ")}.`,
    );
  }

  if (elegido === "file") {
    return { adaptador: "file" };
  }

  const remitente = env.MAIL_FROM?.trim();
  if (remitente === undefined || remitente === "") {
    throw new ConfiguracionDeMailerInvalida(
      "MAILER=ses exige MAIL_FROM con la dirección desde la que se envía (por ejemplo " +
        "avisos@tudominio.co). Debe pertenecer al dominio verificado en SES: la política de IAM " +
        "de la instancia sólo permite enviar desde ese dominio, así que otra dirección haría " +
        "fallar cada correo, uno por uno, en vez de avisar aquí.",
    );
  }

  // Forma mínima, no validación exhaustiva: que el dominio sea el correcto lo hace cumplir IAM, y
  // duplicar esa regla aquí crearía dos verdades que pueden discrepar.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(remitente)) {
    throw new ConfiguracionDeMailerInvalida(
      `MAIL_FROM=${remitente} no parece una dirección de correo.`,
    );
  }

  return {
    adaptador: "ses",
    remitente,
    // El mismo valor que recibe Caddy en docker-compose.prod.yml.
    region: env.AWS_REGION?.trim() ?? "us-east-1",
  };
}
