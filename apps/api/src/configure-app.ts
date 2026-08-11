import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter.js";
import { csrfMiddleware } from "./common/auth/csrf.js";
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
  // **Todo el API cuelga de `/api`**, y no es cosmético: la aplicación web se sirve desde el mismo
  // origen —lo exige la cookie de sesión, que es del subdominio del club (`ADR-013`)— así que sus
  // rutas y las del API comparten espacio de nombres. Sin prefijo, `/me/profile` del navegador cae
  // en el controlador `/me` del servidor y la pantalla nunca llega a existir. Es exactamente lo
  // que pasó al escribir T-130.
  //
  // La topología de `docs/07` §4 ya lo daba por hecho (`reverse_proxy /api/*`, salud en
  // `/api/health`); lo que faltaba era que el API lo cumpliera.
  app.setGlobalPrefix("api");

  // Express anuncia `X-Powered-By` en cada respuesta. No es una vulnerabilidad por sí misma, pero
  // le regala a quien escanea la lista exacta de tecnologías que buscar en un boletín de CVE, y
  // apagarlo cuesta una línea. Se hace aquí, junto al resto del montaje, y no en un `helmet`
  // completo: el endurecimiento de cabeceras es una tarea propia con su propio criterio.
  const servidorHttp: unknown = app.getHttpAdapter().getInstance();

  if (esApagable(servidorHttp)) {
    servidorHttp.disable("x-powered-by");
  }

  app.use(requestIdMiddleware);
  // Sin firmar: la cookie de sesión es un identificador opaco de 256 bits que sólo vale contra la
  // tabla `session` (ADR-005). Firmarla protegería contra manipulación de un valor que no
  // significa nada por sí mismo, y agregaría un secreto más que rotar.
  app.use(cookieParser());
  // Después de `cookieParser` —necesita leer la cookie de sesión— y antes del filtro, para que su
  // rechazo salga con la forma de error de siempre.
  app.use(csrfMiddleware);
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
