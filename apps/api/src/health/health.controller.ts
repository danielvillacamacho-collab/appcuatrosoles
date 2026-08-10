import { Controller, Get } from "@nestjs/common";

/**
 * docs/07-deployment-ec2.md §8 — /health confirma que el proceso responde; /ready se amplía
 * cuando exista conexión a Postgres (T-001 en adelante) para confirmar que la base también
 * responde. Un fallo de /ready es la primera pista de un incidente de datos/disco.
 */
@Controller()
export class HealthController {
  @Get("health")
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  ready(): { status: "ok" } {
    return { status: "ok" };
  }
}
