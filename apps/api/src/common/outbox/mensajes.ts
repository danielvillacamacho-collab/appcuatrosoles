import type { Prisma } from "@prisma/client";
import type { MensajeDeCorreo } from "../mailer/mailer.port.js";

/**
 * Convierte un trabajo de la bandeja en el correo que se va a enviar.
 *
 * **Los textos están aquí y no en el servicio que encola**, por dos razones. La primera es que el
 * correo se redacta una vez y se manda desde varios lugares —una invitación se crea al dar de alta
 * un club y al crear un usuario—. La segunda es que así el trabajo encolado guarda **datos**
 * (a quién, con qué enlace) y no un texto ya armado: si mañana se corrige una redacción, los
 * mensajes que estaban en cola salen con la nueva.
 *
 * Son plantillas mínimas. `docs/00` ADR-008 prevé MJML compilado en build (T-090); esto es lo que
 * permite probar el producto en local mientras tanto, y su reemplazo no toca a quien encola.
 */
export function construirCorreo(tipo: string, payload: Prisma.JsonValue): MensajeDeCorreo {
  const datos = comoObjeto(payload);
  const para = texto(datos.email);
  const nombre = texto(datos.fullName) || "Hola";
  const enlace = texto(datos.link);

  switch (tipo) {
    case "identity.send-invitation":
      return correo(
        para,
        "Te invitaron a la plataforma del club",
        `${nombre}, te crearon una cuenta en la plataforma del club. Define tu contraseña para entrar:`,
        enlace,
        "Define tu contraseña",
      );

    case "identity.send-password-reset":
      return correo(
        para,
        "Restablece tu contraseña",
        `${nombre}, pediste restablecer tu contraseña. El enlace vale una sola vez y por una hora:`,
        enlace,
        "Restablecer contraseña",
      );

    case "identity.notify-password-changed":
      return correo(
        para,
        "Tu contraseña cambió",
        `${nombre}, tu contraseña se cambió hace un momento. Si no fuiste tú, comunícate con la administración del club de inmediato.`,
        "",
        "",
      );

    case "identity.notify-account-status-changed":
      return correo(
        para,
        "El estado de tu cuenta cambió",
        `${nombre}, el estado de tu cuenta cambió a «${texto(datos.status)}». Si tienes dudas, comunícate con la administración del club.`,
        "",
        "",
      );

    default:
      // Un tipo desconocido es un error de programación, no un correo raro: se prefiere que falle
      // el envío —y que quede en `last_error`— a mandar un mensaje vacío que nadie entiende.
      throw new Error(`Tipo de mensaje desconocido en la bandeja de salida: ${tipo}`);
  }
}

function correo(
  para: string,
  asunto: string,
  cuerpo: string,
  enlace: string,
  textoDelEnlace: string,
): MensajeDeCorreo {
  const conEnlace = enlace.length > 0;
  const html = [
    `<p>${cuerpo}</p>`,
    conEnlace ? `<p><a href="${enlace}">${textoDelEnlace}</a></p>` : "",
    conEnlace ? `<p style="color:#666;font-size:12px">Si el botón no funciona: ${enlace}</p>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    para,
    asunto,
    html,
    // Siempre se manda también en texto plano: un correo sólo-HTML cae en spam con más facilidad.
    texto: conEnlace ? `${cuerpo}\n\n${enlace}` : cuerpo,
  };
}

function comoObjeto(payload: Prisma.JsonValue): Record<string, unknown> {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}
