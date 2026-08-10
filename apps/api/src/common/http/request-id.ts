import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Identificador de la solicitud, presente en el log de Pino y en toda respuesta de error
 * (`docs/03` §2). Es el hilo que conecta «me salió un error a las 3 p.m.» con la traza exacta.
 */
export const CABECERA_REQUEST_ID = "x-request-id";

/** Pegado al `Request` de Express por el middleware; lo leen el filtro de errores y el logger. */
export interface ConRequestId {
  requestId?: string;
}

/**
 * **Siempre se genera aquí, nunca se acepta el que venga del cliente.** Reutilizar una cabecera
 * entrante es cómodo para correlacionar, pero deja que cualquiera escriba en nuestros logs: repetir
 * el mismo identificador en miles de solicitudes vuelve inútil la búsqueda justo durante un
 * incidente, y un valor con saltos de línea inyecta entradas falsas en el journal. Si algún día hay
 * un proxy de confianza que necesite propagar el suyo, será una decisión explícita con su ADR.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = `req_${randomUUID()}`;

  (req as Request & ConRequestId).requestId = requestId;
  res.setHeader(CABECERA_REQUEST_ID, requestId);

  next();
}

export function leerRequestId(req: ConRequestId): string {
  return req.requestId ?? "req_desconocido";
}
