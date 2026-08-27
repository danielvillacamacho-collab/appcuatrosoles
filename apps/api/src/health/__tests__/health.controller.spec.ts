import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "../health.controller.js";
import type { PrismaService } from "../../common/prisma/prisma.service.js";

/** Una base que responde, o que no. Es lo único que estos tests necesitan simular. */
function baseQue(responde: boolean): PrismaService {
  return {
    $queryRaw: responde
      ? vi.fn().mockResolvedValue([{ "?column?": 1 }])
      : vi.fn().mockRejectedValue(new Error("connection refused")),
  } as unknown as PrismaService;
}

describe("HealthController", () => {
  it("/health responde ok SIN tocar la base", async () => {
    // Es la distinción entera entre las dos rutas: si la base se cae, `/health` tiene que seguir
    // respondiendo. «El servidor está muerto» y «el servidor vive y la base no» son dos incidentes
    // distintos, y una sola señal para los dos no deja diferenciarlos.
    const base = baseQue(false);
    const controller = new HealthController(base);

    expect(controller.health().status).toBe("ok");
    expect(base.$queryRaw).not.toHaveBeenCalled();
  });

  it("/health dice de qué commit salió la imagen", async () => {
    // Para poder comprobar un despliegue desde fuera sin deducirlo del hash de un archivo compilado.
    const controller = new HealthController(baseQue(true));

    expect(controller.health().version).toBeTypeOf("string");
    expect(controller.health().version.length).toBeGreaterThan(0);
  });

  it("/ready SÍ consulta la base", async () => {
    const base = baseQue(true);
    const controller = new HealthController(base);

    await expect(controller.ready()).resolves.toMatchObject({ status: "ok" });
    expect(base.$queryRaw, "sin esta consulta, `/ready` es una copia de `/health`").toHaveBeenCalled();
  });

  it("/ready responde 503 cuando la base NO responde", async () => {
    // **Es la razón de existir de esta ruta.** Durante mucho tiempo devolvía `ok` pasara lo que
    // pasara, mientras el healthcheck del compose la usaba creyendo que comprobaba la base: un
    // contenedor incapaz de leer una sola fila se reportaba sano.
    const controller = new HealthController(baseQue(false));

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
