import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { concatMap, type Observable } from "rxjs";
import type { ConSessionUser } from "../auth/current-user.js";
import type { ConTenant } from "../auth/permission.guard.js";
import { leerRequestId, type ConRequestId } from "../http/request-id.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AUDITABLE, sinDatosSensibles, type AuditableMetadata, type ConAuditoria } from "./auditable.js";

type SolicitudAuditada = Request & ConRequestId & ConSessionUser & ConTenant & ConAuditoria;

/**
 * Escribe una fila en `audit_log` por cada mutación marcada con `@Auditable()` (`docs/03` §9).
 *
 * **Sólo cuando la acción salió bien.** Si el manejador falla, no hubo cambio que auditar: una
 * fila por cada intento fallido convertiría el registro de «qué le pasó a este usuario» en un log
 * de tráfico, y encontrar el cambio real entre cien intentos rechazados es justo lo que la
 * auditoría debería evitar. Los intentos rechazados son otra cosa —un registro de seguridad— y
 * tienen su propio lugar en el log de Pino.
 *
 * **Exactamente una fila, ni cero ni dos** (T-081): el interceptor es el único que escribe, y por
 * eso ningún servicio debe volver a hacerlo por su cuenta.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(contexto: ExecutionContext, next: CallHandler): Observable<unknown> {
    const marca = this.reflector.getAllAndOverride<AuditableMetadata | undefined>(AUDITABLE, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (marca === undefined) {
      return next.handle();
    }

    const req = contexto.switchToHttp().getRequest<SolicitudAuditada>();

    return next.handle().pipe(
      concatMap(async (respuesta: unknown) => {
        await this.registrar(marca, req, respuesta);

        return respuesta;
      }),
    );
  }

  private async registrar(
    marca: AuditableMetadata,
    req: SolicitudAuditada,
    respuesta: unknown,
  ): Promise<void> {
    // Los campos JSON se **omiten** cuando no hay nada que guardar, en vez de mandarse como
    // `undefined`: con `exactOptionalPropertyTypes`, pasar la clave con valor indefinido no es lo
    // mismo que no pasarla, y lo que queremos en la columna es `NULL`.
    const before = comoJson(req.auditoria?.before);
    const after = comoJson(respuesta);

    await this.prisma.auditLog.create({
      data: {
        action: marca.action,
        entityType: marca.entityType,
        entityId: resolverEntityId(req, respuesta),
        // Nulo en acciones de alcance de plataforma, que no cuelgan de ningún club
        // (`schema.prisma`). En una ruta de club siempre lo puso `TenantGuard` antes.
        clubId: req.tenant?.clubId ?? null,
        // Nulo cuando la acción la ejecuta el sistema y no una persona: «nadie» y «no sabemos
        // quién» no son lo mismo, y el esquema los distingue.
        actorUserId: req.sessionUser?.userAccountId ?? null,
        requestId: leerRequestId(req),
        ...(before === undefined ? {} : { before }),
        ...(after === undefined ? {} : { after }),
      },
    });
  }
}

/**
 * De dónde sale el identificador de lo que se tocó: lo que anotó el servicio, el `id` de la
 * respuesta (una creación), o el `:id` de la ruta (una edición).
 *
 * Si no aparece por ninguna vía, **falla**. Una fila de auditoría sin saber sobre qué entidad fue
 * no responde la única pregunta que la auditoría existe para responder, y escribirla igual con un
 * valor vacío es peor que no escribirla: parece que hay rastro.
 */
function resolverEntityId(req: SolicitudAuditada, respuesta: unknown): string {
  const anotado = req.auditoria?.entityId;

  if (anotado !== undefined) {
    return anotado;
  }

  if (respuesta !== null && typeof respuesta === "object" && "id" in respuesta) {
    const id: unknown = (respuesta as { id: unknown }).id;

    if (typeof id === "string") {
      return id;
    }
  }

  const enLaRuta: unknown = req.params.id;

  if (typeof enLaRuta === "string") {
    return enLaRuta;
  }

  throw new Error(
    "Ruta @Auditable() sin identificador de entidad: ni la respuesta trae `id`, ni la ruta tiene " +
      "`:id`, ni el servicio lo anotó con `anotarEstadoPrevio`.",
  );
}

/** `undefined` es «no se registró»; en la columna eso es `NULL`, no la cadena "undefined". */
function comoJson(valor: unknown): Prisma.InputJsonValue | undefined {
  if (valor === undefined) {
    return undefined;
  }

  return sinDatosSensibles(valor) as Prisma.InputJsonValue;
}
