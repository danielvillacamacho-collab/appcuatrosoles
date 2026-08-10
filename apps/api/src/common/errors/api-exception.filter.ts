import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import type { ApiErrorResponse } from "@polo/contracts";
import { leerRequestId, type ConRequestId } from "../http/request-id.js";
import { logger } from "../logging/logger.js";
import { ApiException, RESPUESTA_INESPERADA, respuestaPorEstado } from "./api-error.js";

/**
 * Filtro global: **toda** respuesta de error del API sale por aquí, con la forma única de
 * `docs/03` §2. Que sea uno solo y global es la regla: si cada controlador arma su propio error,
 * el día que uno se equivoque va a filtrar un mensaje interno, y nadie lo va a notar hasta que un
 * usuario lo vea.
 *
 * Traduce tres familias de excepción y no confía en ninguna otra:
 *
 * 1. `ApiException` — errores de negocio nuestros: traen su código de contrato y su mensaje.
 * 2. `ZodError` — el payload no cumple su esquema (`docs/03` §3 → `400`). `details` dice qué
 *    campos, porque ese es un error del cliente que el cliente puede corregir.
 * 3. `HttpException` de NestJS — las que lanza el framework. Se conserva **el estado** y se
 *    descarta **el mensaje**: los suyos vienen en inglés y describen la infraestructura.
 *
 * Cualquier otra cosa es un `500` con mensaje fijo. El error real se loguea completo, con el mismo
 * `requestId` que recibe el usuario; lo que nunca sale al cliente es su contenido.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const req = contexto.getRequest<Request & ConRequestId>();
    const res = contexto.getResponse<Response>();
    const requestId = leerRequestId(req);

    const { status, code, message, details } = traducir(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // El stack completo, una sola vez y sólo aquí. Es lo que se busca por `requestId` cuando
      // alguien reporta «me salió un error»; el usuario nunca ve nada de esto.
      logger.error({ requestId, err: exception, method: req.method, url: req.url }, "error no controlado");
    } else {
      // Los 4xx son parte de la operación normal (una contraseña mal escrita, un permiso que
      // falta). Se registran sin cuerpo ni mensaje: alcanza para ver patrones —un pico de 401 es
      // una fuerza bruta— sin acumular datos personales en el journal (docs/06 §5).
      logger.info({ requestId, status, code, method: req.method, url: req.url }, "solicitud rechazada");
    }

    const cuerpo: ApiErrorResponse = {
      error: { code, message, requestId, ...(details === undefined ? {} : { details }) },
    };

    res.status(status).json(cuerpo);
  }
}

interface ErrorTraducido {
  status: number;
  code: string;
  message: string;
  /** `| undefined` explícito: el repo compila con `exactOptionalPropertyTypes`. */
  details?: Record<string, unknown> | undefined;
}

function traducir(exception: unknown): ErrorTraducido {
  if (exception instanceof ApiException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.userMessage,
      details: exception.details,
    };
  }

  if (exception instanceof ZodError) {
    const { code, message } = respuestaPorEstado(HttpStatus.BAD_REQUEST);

    return {
      status: HttpStatus.BAD_REQUEST,
      code,
      message,
      details: { fields: exception.flatten().fieldErrors },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();

    return { status, ...respuestaPorEstado(status) };
  }

  return { status: HttpStatus.INTERNAL_SERVER_ERROR, ...RESPUESTA_INESPERADA };
}
