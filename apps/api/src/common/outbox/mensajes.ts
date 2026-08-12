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

    case "practice.confirmed":
      return correo(
        para,
        "La práctica se confirmó",
        datos.dentro === true
          ? `${nombre}, la práctica del ${fechaLegible(datos.startsAt)} se confirmó y estás dentro. Prepará los caballos.`
          : `${nombre}, la práctica del ${fechaLegible(datos.startsAt)} se confirmó, pero quedaste en la lista de espera. Si alguien se baja, entrás vos.`,
        "",
        "",
      );

    case "practice.cancelled":
      // Se le avisa **a todos los postulados**, hayan quedado dentro o en espera: el punto del
      // aviso es que nadie prepare caballos en vano.
      return correo(
        para,
        "La práctica se canceló",
        `${nombre}, la práctica del ${fechaLegible(datos.startsAt)} se canceló porque no se alcanzó el mínimo de jugadores. No prepares los caballos.`,
        "",
        "",
      );

    default:
      // Un tipo desconocido es un error de programación, no un correo raro: se prefiere que falle
      // el envío —y que quede en `last_error`— a mandar un mensaje vacío que nadie entiende.
      throw new Error(`Tipo de mensaje desconocido en la bandeja de salida: ${tipo}`);
  }
}

/**
 * La envoltura común de todos los correos (T-090).
 *
 * **Estilos en línea y tabla de un ancho fijo**: los clientes de correo ignoran hojas de estilo y
 * la mitad no entiende flexbox. Es feo de escribir y es lo que hace que el correo se vea igual en
 * Gmail, en Outlook y en el celular.
 *
 * `ADR-008` prevé plantillas MJML compiladas en build. **No se montó ese paso todavía**, y la razón
 * está escrita en `verification.md`: MJML resuelve el problema de mantener plantillas ricas, y hoy
 * hay cuatro correos de un párrafo y un botón. Cuando haya diez con tablas y encabezados, entra —
 * y entra aquí, sin tocar a quien encola.
 */
function correo(
  para: string,
  asunto: string,
  cuerpo: string,
  enlace: string,
  textoDelEnlace: string,
): MensajeDeCorreo {
  const conEnlace = enlace.length > 0;
  const boton = conEnlace
    ? `<p style="margin:24px 0"><a href="${enlace}" style="background:#1f6f43;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${textoDelEnlace}</a></p>` +
      `<p style="color:#666;font-size:12px;word-break:break-all">Si el botón no funciona, copia esta dirección: ${enlace}</p>`
    : "";

  const html = [
    // El «preheader»: el texto que la bandeja muestra junto al asunto. Sin él, el cliente de
    // correo muestra lo primero que encuentre —a menudo «Si el botón no funciona»— y el correo
    // parece basura antes de que nadie lo abra.
    `<div style="display:none;max-height:0;overflow:hidden">${cuerpo.slice(0, 120)}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:24px 0">',
    '<tr><td align="center">',
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:8px;padding:32px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5">',
    `<tr><td><p style="margin:0 0 16px">${cuerpo}</p>${boton}`,
    '<p style="color:#888;font-size:12px;margin:24px 0 0">Este es un mensaje automático de la plataforma del club.</p>',
    "</td></tr></table></td></tr></table>",
  ].join("\n");

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

/**
 * La fecha de una práctica, para el cuerpo de un correo.
 *
 * En la zona del club **no**: el correo se arma en la bandeja de salida, que no sabe de qué club
 * es. Se manda el instante en ISO y quien lo lee lo interpreta; ponerle una zona adivinada sería
 * peor que no ponerle ninguna. Cuando `specs/120` traiga el enrutamiento de avisos, esto se
 * resuelve ahí con la zona real.
 */
function fechaLegible(valor: unknown): string {
  const iso = texto(valor);

  return iso === "" ? "" : iso.replace("T", " ").slice(0, 16);
}
