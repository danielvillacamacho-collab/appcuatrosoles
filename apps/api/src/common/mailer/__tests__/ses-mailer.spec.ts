import { describe, expect, it, vi } from "vitest";
import { SesMailer } from "../ses-mailer.js";

const MENSAJE = {
  para: "maria@ejemplo.com",
  asunto: "Te invitaron al club",
  html: "<p>Hola María, <a href='https://club.test/invitacion?t=abc'>define tu contraseña</a></p>",
  texto: "Hola María, define tu contraseña: https://club.test/invitacion?t=abc",
};

/** Cliente de SES falso: guarda el comando recibido para poder inspeccionarlo. */
function clienteFalso(respuesta: unknown = { MessageId: "0100018f-mensaje" }) {
  const send = vi.fn().mockResolvedValue(respuesta);
  return { cliente: { send } as never, send };
}

describe("SesMailer", () => {
  it("envía el correo con remitente, destinatario y asunto", async () => {
    const { cliente, send } = clienteFalso();

    await new SesMailer(cliente, "avisos@cuatrosoles.co").enviar(MENSAJE);

    expect(send).toHaveBeenCalledOnce();
    const entrada = send.mock.calls[0]?.[0]?.input;
    expect(entrada.FromEmailAddress).toBe("avisos@cuatrosoles.co");
    expect(entrada.Destination.ToAddresses).toEqual(["maria@ejemplo.com"]);
    expect(entrada.Content.Simple.Subject.Data).toBe("Te invitaron al club");
  });

  it("manda las dos versiones, HTML y texto plano", async () => {
    // Sin la de texto plano el correo cae en spam con más facilidad, y la invitación no llega.
    const { cliente, send } = clienteFalso();

    await new SesMailer(cliente, "avisos@cuatrosoles.co").enviar(MENSAJE);

    const cuerpo = send.mock.calls[0]?.[0]?.input.Content.Simple.Body;
    expect(cuerpo.Html.Data).toBe(MENSAJE.html);
    expect(cuerpo.Text.Data).toBe(MENSAJE.texto);
  });

  it("declara UTF-8 en asunto y cuerpo: los correos van en español", async () => {
    // Sin el juego de caracteres, «Ábrete» o «práctica» llegan con la codificación rota.
    const { cliente, send } = clienteFalso();

    await new SesMailer(cliente, "avisos@cuatrosoles.co").enviar({
      ...MENSAJE,
      asunto: "Confirmación de práctica — miércoles",
    });

    const simple = send.mock.calls[0]?.[0]?.input.Content.Simple;
    expect(simple.Subject.Charset).toBe("UTF-8");
    expect(simple.Body.Html.Charset).toBe("UTF-8");
    expect(simple.Body.Text.Charset).toBe("UTF-8");
  });

  it("si SES falla, propaga el error en vez de tragárselo", async () => {
    // La bandeja de salida es la que reintenta y la que se rinde al quinto intento. Si este
    // adaptador se comiera el error, el mensaje quedaría marcado como enviado sin haberse enviado.
    const send = vi.fn().mockRejectedValue(new Error("Throttling: Maximum sending rate exceeded"));

    await expect(
      new SesMailer({ send } as never, "avisos@cuatrosoles.co").enviar(MENSAJE),
    ).rejects.toThrow(/Throttling/);
  });

  it("no reintenta por su cuenta: un envío, una llamada", async () => {
    // Dos mecanismos de reintento se multiplican, y un correo saldría muchas más veces de las
    // previstas.
    const send = vi.fn().mockRejectedValue(new Error("falla"));

    await expect(
      new SesMailer({ send } as never, "avisos@cuatrosoles.co").enviar(MENSAJE),
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
