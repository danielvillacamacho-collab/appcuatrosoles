import { describe, expect, it } from "vitest";
import {
  ConfiguracionDeMailerInvalida,
  resolverConfiguracionDeMailer,
} from "../mailer.selection.js";

const CORREO = "avisos@cuatrosoles.co";

describe("elección del adaptador de correo · el caso que causó el problema", () => {
  it("en producción, sin MAILER definido, la aplicación NO arranca", () => {
    // Es exactamente lo que pasó en el primer despliegue: SES productivo, la instancia con permiso
    // para enviar, y ninguna invitación saliendo porque el adaptador de archivo seguía puesto por
    // omisión. Ahora eso no puede volver a pasar en silencio.
    expect(() => resolverConfiguracionDeMailer({ NODE_ENV: "production" })).toThrow(
      ConfiguracionDeMailerInvalida,
    );
  });

  it("el error de arranque dice qué hacer, no sólo que algo falta", () => {
    // Quien lea esto a las ocho de la noche necesita la salida, no el diagnóstico.
    try {
      resolverConfiguracionDeMailer({ NODE_ENV: "production" });
      expect.unreachable("debía lanzar");
    } catch (error) {
      const mensaje = (error as Error).message;
      expect(mensaje).toContain("MAILER=ses");
      expect(mensaje).toContain("MAIL_FROM");
      expect(mensaje).toContain("nadie los recibiría");
    }
  });

  it("fuera de producción, sin MAILER, usa el de archivo y no molesta a nadie", () => {
    // Local, los tests y el CI siguen funcionando sin configurar nada.
    expect(resolverConfiguracionDeMailer({})).toEqual({ adaptador: "file" });
    expect(resolverConfiguracionDeMailer({ NODE_ENV: "test" })).toEqual({ adaptador: "file" });
  });
});

describe("elección del adaptador de correo · MAILER=ses", () => {
  it("con remitente válido, elige SES", () => {
    expect(resolverConfiguracionDeMailer({ MAILER: "ses", MAIL_FROM: CORREO })).toEqual({
      adaptador: "ses",
      remitente: CORREO,
      region: "us-east-1",
    });
  });

  it("respeta la región del entorno, la misma que recibe Caddy", () => {
    const config = resolverConfiguracionDeMailer({
      MAILER: "ses",
      MAIL_FROM: CORREO,
      AWS_REGION: "sa-east-1",
    });

    expect(config).toMatchObject({ region: "sa-east-1" });
  });

  it("sin MAIL_FROM no arranca, en vez de fallar una vez por cada correo", () => {
    expect(() => resolverConfiguracionDeMailer({ MAILER: "ses" })).toThrow(/MAIL_FROM/);
    expect(() => resolverConfiguracionDeMailer({ MAILER: "ses", MAIL_FROM: "   " })).toThrow(
      /MAIL_FROM/,
    );
  });

  it("con un MAIL_FROM que no es una dirección, no arranca", () => {
    expect(() =>
      resolverConfiguracionDeMailer({ MAILER: "ses", MAIL_FROM: "no-es-un-correo" }),
    ).toThrow(/no parece una dirección/);
  });
});

describe("elección del adaptador de correo · MAILER=file", () => {
  it("elige el de archivo, incluso en producción, porque alguien lo pidió explícitamente", () => {
    expect(resolverConfiguracionDeMailer({ MAILER: "file", NODE_ENV: "production" })).toEqual({
      adaptador: "file",
    });
  });
});

describe("elección del adaptador de correo · entradas raras", () => {
  it("acepta mayúsculas y espacios sobrantes", () => {
    expect(resolverConfiguracionDeMailer({ MAILER: "  SES  ", MAIL_FROM: CORREO })).toMatchObject({
      adaptador: "ses",
    });
  });

  it("un valor que no existe no cae en un adaptador por descarte: no arranca", () => {
    // Un `MAILER=sendgrid` mal puesto no debe terminar escribiendo a disco sin que nadie lo note.
    expect(() => resolverConfiguracionDeMailer({ MAILER: "sendgrid" })).toThrow(
      /no es un valor válido/,
    );
  });

  it("una cadena vacía se trata como no definida", () => {
    expect(resolverConfiguracionDeMailer({ MAILER: "" })).toEqual({ adaptador: "file" });
    expect(() => resolverConfiguracionDeMailer({ MAILER: "", NODE_ENV: "production" })).toThrow();
  });
});
