import { Inject, Injectable, NotFoundException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { resolveTenant } from "@polo/domain";
import { leerRequestId, type ConRequestId } from "../common/http/request-id.js";
import { logger } from "../common/logging/logger.js";
import { ClubDirectory } from "./club-directory.js";
import { BASE_DOMAIN } from "./base-domain.js";
import type { ConTenant } from "./tenant-context.js";

/**
 * Resuelve a qué club pertenece la solicitud, a partir del **host** (ADR-013, R-020-01).
 *
 * **Corre antes que cualquier otro guard**, y el orden no es una preferencia: `SessionGuard`
 * consulta la tabla de sesiones y `PermissionGuard` la de roles. Si el tenant se resolviera
 * después, un host desconocido llegaría a tocar datos de usuarios antes de ser rechazado — y la
 * forma de averiguar si una cuenta existe sería preguntar desde un subdominio inventado.
 *
 * **Todo lo que no resuelve responde `404`, siempre igual** (R-020-02, P-12). Un club suspendido,
 * uno inexistente, un host malformado y un host de otro dominio dan exactamente la misma respuesta.
 * Distinguirlos le confirmaría a un competidor que cierto club es cliente nuestro. El motivo real
 * va al log, que es donde sirve.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly directorio: ClubDirectory,
    @Inject(BASE_DOMAIN) private readonly baseDomain: string,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request & ConRequestId & ConTenant>();

    // El `Host` tal como llegó. Detrás del proxy inverso, Caddy lo conserva (`docs/07`); lo que
    // **no** se lee es ningún `X-Forwarded-Host`, porque cualquiera puede escribirlo: aceptarlo
    // sería dejar que el cliente elija su propio tenant, que es exactamente lo que R-020-01
    // prohíbe.
    const host = req.headers.host ?? "";

    const veredicto = resolveTenant(host, this.baseDomain, await this.directorio.all());

    if (!veredicto.ok) {
      logger.info(
        { requestId: leerRequestId(req), host, motivo: veredicto.error, url: req.url },
        "tenant no resuelto",
      );

      // Un `404` desnudo: sin cuerpo propio, sin detalle, sin decir qué host se probó. El filtro
      // global (T-024) lo convierte en el mensaje genérico de «no encontramos lo que buscas».
      throw new NotFoundException();
    }

    req.tenant = { clubId: veredicto.value.id };

    return true;
  }
}
