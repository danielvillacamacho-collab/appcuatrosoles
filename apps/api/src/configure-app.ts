import type { INestApplication } from "@nestjs/common";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter.js";
import { requestIdMiddleware } from "./common/http/request-id.js";

/**
 * Todo lo que hay que montar sobre la aplicación además de sus módulos.
 *
 * Vive aparte de `main.ts` para que los tests arranquen **exactamente** la misma aplicación que
 * corre en producción. No es teoría: en T-005 se descubrió que el API compilada nunca había
 * arrancado, porque nada probaba el arranque real. Un filtro global que sólo se registra en
 * `main.ts` tiene el mismo problema al revés — los tests verían errores con una forma que el
 * usuario nunca recibe, o peor, no verían el filtro faltante.
 *
 * El orden importa: el middleware de `requestId` corre antes que nada, para que incluso un error
 * lanzado por el primer guard tenga identificador que reportar.
 */
export function configurarApp(app: INestApplication): INestApplication {
  // Express anuncia `X-Powered-By` en cada respuesta. No es una vulnerabilidad por sí misma, pero
  // le regala a quien escanea la lista exacta de tecnologías que buscar en un boletín de CVE, y
  // apagarlo cuesta una línea. Se hace aquí, junto al resto del montaje, y no en un `helmet`
  // completo: el endurecimiento de cabeceras es una tarea propia con su propio criterio.
  const servidorHttp: unknown = app.getHttpAdapter().getInstance();

  if (esApagable(servidorHttp)) {
    servidorHttp.disable("x-powered-by");
  }

  app.use(requestIdMiddleware);
  app.useGlobalFilters(new ApiExceptionFilter());

  return app;
}

/**
 * El adaptador HTTP de NestJS no promete qué servidor hay debajo (podría no ser Express), así que
 * se comprueba en vez de castear: `unknown` + narrowing, nunca `any` (`CLAUDE.md`, calidad).
 */
function esApagable(servidor: unknown): servidor is { disable(nombre: string): void } {
  // Ojo con el `typeof === "function"`: una aplicación de Express **es** una función (se puede
  // invocar como manejador de peticiones), no un objeto. Comprobar sólo `"object"` deja pasar el
  // caso real sin hacer nada, en silencio — que es exactamente lo que pasó al escribir esto, y lo
  // atrapó el test de la cabecera.
  if (servidor === null || (typeof servidor !== "object" && typeof servidor !== "function")) {
    return false;
  }

  return "disable" in servidor && typeof (servidor as { disable: unknown }).disable === "function";
}
