import { Controller, Get, HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service.js";

/** El commit del que salió esta imagen. Lo pone el `Dockerfile` al construir (`docs/07` §6). */
const VERSION = process.env["APP_VERSION"] ?? "desconocida";

/**
 * `docs/07` §8 — señales de vida.
 *
 * **`/health` dice que el proceso responde; `/ready` dice que puede trabajar.** La diferencia es la
 * base: un proceso vivo que no puede consultar nada no está listo para recibir tráfico, y por eso
 * el healthcheck del compose apunta a `/ready` y no a `/health`.
 *
 * Durante mucho tiempo esa distinción **no existió**: `/ready` devolvía `ok` sin preguntarle nada a
 * PostgreSQL, mientras el comentario del compose afirmaba que sí lo hacía. El healthcheck daba por
 * sano un contenedor que no podía consultar una sola fila. Se descubrió comprobando un despliegue
 * desde fuera, y es exactamente la clase de cosa que sólo se nota el día que importa.
 */
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ¿El proceso responde?
   *
   * **No toca la base a propósito.** Si la base se cae, `/health` tiene que seguir respondiendo:
   * es lo que distingue «el servidor está muerto» de «el servidor está vivo y la base no», y son
   * dos incidentes distintos con dos respuestas distintas.
   *
   * Devuelve además la versión, para poder comprobar un despliegue desde fuera sin tener que
   * deducirla del hash de un archivo compilado.
   */
  @Get("health")
  health(): { status: "ok"; version: string } {
    return { status: "ok", version: VERSION };
  }

  /** ¿Puede trabajar? Es la pregunta que decide si este contenedor debe recibir tráfico. */
  @Get("ready")
  async ready(): Promise<{ status: "ok"; version: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503 y no 500: no es un error de la petición, es que este proceso todavía no sirve. El
      // healthcheck de Docker sólo mira el código, pero quien lea el log tiene que entender cuál
      // de los dos problemas es.
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: { code: "BASE_NO_DISPONIBLE", message: "La base de datos no responde." },
      });
    }

    return { status: "ok", version: VERSION };
  }
}
