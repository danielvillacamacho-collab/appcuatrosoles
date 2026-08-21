import { describe, expect, it, vi } from "vitest";
import { CODIGOS_DE_ERROR } from "@polo/contracts";
import { ApiError, NetworkError } from "../api-client.js";
import { camposConError, mensajeDeError, textoDeCodigo } from "../error-message.js";
import { copy } from "../../i18n/es-CO.js";

function errorDelApi(code: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(422, {
    code,
    message: "Un mensaje del servidor, escrito para el log.",
    requestId: "abc-123",
    ...(details === undefined ? {} : { details }),
  });
}

describe("mensajeDeError", () => {
  it("traduce el código del API a la frase de la interfaz", () => {
    expect(mensajeDeError(errorDelApi("email_en_uso"))).toBe("Ya existe una cuenta con ese correo.");
  });

  it("NUNCA muestra el mensaje que mandó el servidor", () => {
    // Ese texto se escribió sin saber en qué pantalla iba a aparecer, y vive fuera de `es-CO.ts`,
    // donde el club no puede revisarlo ni corregirlo (regla de oro 1).
    expect(mensajeDeError(errorDelApi("email_en_uso"))).not.toContain("escrito para el log");
  });

  it("quedarse sin red dice algo distinto: ahí no falló una regla del club", () => {
    expect(mensajeDeError(new NetworkError(new TypeError("Failed to fetch")))).toBe(
      copy.errores.sinRed,
    );
  });

  it("cualquier otra cosa cae en el genérico, sin romper la pantalla", () => {
    expect(mensajeDeError(new Error("algo raro"))).toBe(copy.errores.generico);
    expect(mensajeDeError(undefined)).toBe(copy.errores.generico);
  });
});

describe("textoDeCodigo · el contrato con el API", () => {
  it("todo código que el API puede responder tiene su texto en español", () => {
    // Es el test que hace que agregar un código al API sin traducirlo falle aquí, en vez de que
    // un usuario vea «ocurrió un error» sin saber qué hacer.
    const textos: Record<string, string> = copy.errores;
    const sinTexto = CODIGOS_DE_ERROR.filter((code) => textos[code] === undefined);

    expect(sinTexto).toEqual([]);
  });

  it("ningún texto está vacío ni es un marcador de posición", () => {
    for (const [code, texto] of Object.entries(copy.errores)) {
      expect(texto.length, `el texto de «${code}» es demasiado corto`).toBeGreaterThan(10);
      expect(texto, `el texto de «${code}» quedó sin escribir`).not.toMatch(/TODO|PENDIENTE/u);
    }
  });

  it("un código desconocido avisa en consola: si no, la falta se descubre en producción", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(textoDeCodigo("codigo_que_nadie_tradujo")).toBe(copy.errores.generico);
    expect(aviso).toHaveBeenCalledOnce();

    aviso.mockRestore();
  });

  it("no distingue «no existe» de «contraseña mala»: eso lo protege el API y no se deshace aquí", () => {
    // Dos mensajes distintos convertirían la pantalla de ingreso en un buscador de cuentas del
    // club (R-010-07, P-12). El API responde un solo código, y la interfaz respeta esa decisión.
    expect(copy.errores.CREDENTIALS_INVALID).not.toMatch(/correo no existe|no está registrado/iu);
  });
});

describe("camposConError", () => {
  it("dice qué campos fallaron, sin repetir el mensaje en inglés de Zod", () => {
    // El formulario decide qué decir de cada campo: es el único que sabe cómo se llama en su
    // pantalla.
    const error = errorDelApi("VALIDATION_FAILED", {
      fields: { email: ["Invalid email"], password: ["Too short"] },
    });

    expect(camposConError(error)).toEqual(["email", "password"]);
  });

  it("un error sin detalle de campos no devuelve nada", () => {
    expect(camposConError(errorDelApi("email_en_uso"))).toEqual([]);
    expect(camposConError(new Error("otra cosa"))).toEqual([]);
  });
});

describe("la referencia para reportar, mientras el club está probando", () => {
  it("un error SIN explicación trae el código que lo hace encontrable en los registros", () => {
    // Convierte «no me dejó guardar» en una línea de log exacta. El API ya devuelve ese
    // identificador en cada error y lo registra junto al stack.
    const sinExplicacion = new ApiError(500, {
      code: "codigo_que_no_existe",
      message: "del servidor",
      requestId: "req-abc123",
    });

    expect(mensajeDeError(sinExplicacion)).toContain("req-abc123");
  });

  it("y un error QUE SÍ se explica no lo trae: ahí el código sólo estorba", () => {
    // «Esa cancha ya está ocupada» le dice a la persona qué hacer. Un identificador de doce
    // caracteres al lado no agrega nada y ensucia la pantalla.
    const conExplicacion = new ApiError(409, {
      code: "cancha_ocupada",
      message: "del servidor",
      requestId: "req-abc123",
    });

    expect(mensajeDeError(conExplicacion)).toBe(copy.errores.cancha_ocupada);
    expect(mensajeDeError(conExplicacion)).not.toContain("req-abc123");
  });

  it("sin identificador, el mensaje sale limpio", () => {
    const sinId = new ApiError(500, { code: "raro", message: "x", requestId: "" });

    expect(mensajeDeError(sinId)).toBe(copy.errores.generico);
  });
});
