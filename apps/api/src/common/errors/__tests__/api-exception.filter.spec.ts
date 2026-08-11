import "reflect-metadata";
import {
  ConflictException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Module,
  UnauthorizedException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiErrorResponse } from "@polo/contracts";
import { configurarApp } from "../../../configure-app.js";
import { leerRequestId } from "../../http/request-id.js";
import { ApiException } from "../api-error.js";

/** Mensaje interno que jamás puede aparecer en una respuesta (nombra una tabla real). */
const FUGA = "column user_account.password_hash does not exist";

@Controller("pruebas")
class ControladorDePruebas {
  @Get("negocio")
  negocio(): never {
    throw new ApiException("PRACTICE_ALREADY_FULL", HttpStatus.CONFLICT, "Esta práctica ya está llena.", {
      field: "practiceId",
    });
  }

  @Get("sin-sesion")
  sinSesion(): never {
    throw new UnauthorizedException("Session cookie missing for user 42");
  }

  @Get("esquema")
  esquema(): never {
    z.object({ email: z.string().email(), chukkers: z.number() }).parse({ email: "no-es-correo" });
    throw new Error("inalcanzable");
  }

  @Get("roto")
  roto(): never {
    throw new Error(FUGA);
  }

  @Get("codigo-propio")
  codigoPropio(): never {
    throw new ConflictException({ code: "slug_en_uso" });
  }

  @Get("codigo-vacio")
  codigoVacio(): never {
    throw new ConflictException({ code: "" });
  }

  @Get("cuerpo-sin-codigo")
  cuerpoSinCodigo(): never {
    throw new ConflictException({ motivo: "no usa la convención" });
  }

  @Get("estado-raro")
  estadoRaro(): never {
    // Un estado fuera de la tabla de `docs/03` §3. No debería ocurrir, pero si una librería lanza
    // uno, la respuesta tiene que seguir siendo válida en vez de traer `undefined`.
    throw new HttpException("I'm a teapot", 418);
  }
}

@Module({ controllers: [ControladorDePruebas] })
class ModuloDePruebas {}

describe("ApiExceptionFilter (docs/03 §2)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ModuloDePruebas] }).compile();
    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("un error de negocio viaja con su código de contrato, su mensaje y sus detalles", async () => {
    const respuesta = await request(app.getHttpServer()).get("/api/pruebas/negocio");

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toMatchObject({
      code: "PRACTICE_ALREADY_FULL",
      message: "Esta práctica ya está llena.",
      details: { field: "practiceId" },
    });
  });

  it("toda respuesta de error cumple el esquema de contrato, no sólo el tipo", async () => {
    // docs/03 §4: que compile no basta; se valida la respuesta real contra el esquema real.
    const rutas = ["/api/pruebas/negocio", "/api/pruebas/sin-sesion", "/api/pruebas/esquema", "/api/pruebas/roto", "/api/no-existe"];

    for (const ruta of rutas) {
      const respuesta = await request(app.getHttpServer()).get(ruta);

      expect(ApiErrorResponse.safeParse(respuesta.body).success).toBe(true);
    }
  });

  it("un error inesperado no filtra jamás el mensaje interno", async () => {
    const respuesta = await request(app.getHttpServer()).get("/api/pruebas/roto");

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(respuesta.body)).not.toContain(FUGA);
    expect(JSON.stringify(respuesta.body)).not.toContain("user_account");
  });

  it("una excepción de NestJS conserva su estado pero no su mensaje en inglés", async () => {
    const respuesta = await request(app.getHttpServer()).get("/api/pruebas/sin-sesion");

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error).toMatchObject({
      code: "UNAUTHENTICATED",
      message: "Debes iniciar sesión para continuar.",
    });
    // El mensaje original nombraba a un usuario concreto: eso es filtración de datos de terceros.
    // Se comprueba sobre el mensaje y no sobre el cuerpo entero porque el `requestId` es aleatorio
    // y puede contener cualquier subcadena por azar — un test que falla una vez cada tanto es peor
    // que no tenerlo.
    expect(respuesta.body.error.message).not.toContain("Session");
    expect(respuesta.body.error.message).not.toContain("42");
  });

  it("una ruta inexistente responde 404 en español, sin describir la infraestructura", async () => {
    const respuesta = await request(app.getHttpServer()).get("/api/no-existe");

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(respuesta.body)).not.toContain("Cannot GET");
  });

  it("un estado fuera del catálogo conserva su código HTTP y responde genérico, nunca undefined", async () => {
    const respuesta = await request(app.getHttpServer()).get("/api/pruebas/estado-raro");

    expect(respuesta.status).toBe(418);
    expect(respuesta.body.error.code).toBe("INTERNAL_ERROR");
    expect(ApiErrorResponse.safeParse(respuesta.body).success).toBe(true);
    expect(JSON.stringify(respuesta.body)).not.toContain("teapot");
  });

  it("una excepción de NestJS con `code` propio lo conserva: es nuestro, no del framework", async () => {
    // Conservar el código y descartar el mensaje son dos decisiones distintas. El mensaje de
    // NestJS viene en inglés y describe la infraestructura; `slug_en_uso` es lo que necesita el
    // frontend para decir «ese subdominio ya está tomado» en vez de «datos inválidos».
    const respuesta = await request(app.getHttpServer()).get("/api/pruebas/codigo-propio");

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe("slug_en_uso");
    expect(ApiErrorResponse.safeParse(respuesta.body).success).toBe(true);
  });

  it("un cuerpo sin `code`, o con uno vacío, cae en el código genérico del estado", async () => {
    // Es un contrato con quien lanza, no una casualidad: cualquier otra forma de cuerpo tiene que
    // seguir produciendo una respuesta válida.
    for (const ruta of ["/api/pruebas/cuerpo-sin-codigo", "/api/pruebas/codigo-vacio"]) {
      const respuesta = await request(app.getHttpServer()).get(ruta);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("CONFLICT");
    }
  });

  it("ninguna respuesta anuncia con qué está construido el servidor", async () => {
    const respuesta = await request(app.getHttpServer()).get("/api/pruebas/negocio");

    expect(respuesta.headers["x-powered-by"]).toBeUndefined();
  });

  it("un payload que no cumple su esquema responde 400 diciendo qué campos", async () => {
    const respuesta = await request(app.getHttpServer()).get("/api/pruebas/esquema");

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe("VALIDATION_FAILED");
    expect(respuesta.body.error.details.fields).toHaveProperty("email");
    expect(respuesta.body.error.details.fields).toHaveProperty("chukkers");
  });
});

describe("requestId (docs/03 §2)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ModuloDePruebas] }).compile();
    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("el identificador del cuerpo es el mismo de la cabecera — si no, no sirve para buscar", async () => {
    const respuesta = await request(app.getHttpServer()).get("/api/pruebas/roto");

    expect(respuesta.body.error.requestId).toBe(respuesta.headers["x-request-id"]);
    expect(respuesta.body.error.requestId).toMatch(/^req_/);
  });

  it("cada solicitud trae uno distinto", async () => {
    const primera = await request(app.getHttpServer()).get("/api/pruebas/roto");
    const segunda = await request(app.getHttpServer()).get("/api/pruebas/roto");

    expect(primera.body.error.requestId).not.toBe(segunda.body.error.requestId);
  });

  it("no se reutiliza el que manda el cliente: escribiría en nuestros logs", async () => {
    const respuesta = await request(app.getHttpServer())
      .get("/api/pruebas/roto")
      // Sin salto de línea: Node rechaza esa cabecera antes de que salga, así que la inyección de
      // log directa ya está cubierta por la plataforma. Lo que este test protege es lo otro: que
      // un cliente no pueda repetir el mismo identificador en miles de solicitudes y volver
      // inútil la búsqueda durante un incidente.
      .set("x-request-id", "req_inyectado-por-el-cliente");

    expect(respuesta.body.error.requestId).not.toContain("inyectado");
    expect(respuesta.body.error.requestId).toMatch(/^req_[0-9a-f-]+$/);
  });
});

describe("leerRequestId", () => {
  it("si el middleware no corrió, devuelve un marcador en vez de romper la respuesta de error", () => {
    // Pasa si alguien altera el orden del montaje en `configure-app.ts`. Preferimos un error con
    // identificador inútil a un error que se cae al armar la respuesta de otro error.
    expect(leerRequestId({})).toBe("req_desconocido");
  });
});

describe("configurarApp", () => {
  it("no se cae si el servidor de abajo no es Express (el adaptador no promete cuál es)", () => {
    const montados: string[] = [];
    const appFalsa = {
      getHttpAdapter: () => ({ getInstance: () => ({}) }),
      setGlobalPrefix: (prefijo: string) => montados.push(`prefijo:${prefijo}`),
      use: (middleware: { name: string }) => montados.push(middleware.name),
      useGlobalFilters: () => montados.push("filtro"),
    } as unknown as INestApplication;

    expect(() => configurarApp(appFalsa)).not.toThrow();
    // El orden es parte del contrato: el `requestId` tiene que existir antes que nada para que
    // cualquier error posterior tenga identificador que reportar; la protección CSRF va después de
    // `cookieParser`, porque necesita leer la cookie de sesión; y el filtro va al final, para que
    // el rechazo de cualquiera de ellos salga con la forma de error de siempre.
    expect(montados).toEqual([
      // Todo el API cuelga de `/api`: la aplicación web comparte origen y sin prefijo sus rutas
      // chocarían con las del servidor (ver la nota de `configure-app.ts`).
      "prefijo:api",
      "requestIdMiddleware",
      "cookieParser",
      "csrfMiddleware",
      "filtro",
    ]);
  });

  it("tampoco si el adaptador no expone servidor alguno", () => {
    const appFalsa = {
      getHttpAdapter: () => ({ getInstance: () => null }),
      setGlobalPrefix: () => undefined,
      use: () => undefined,
      useGlobalFilters: () => undefined,
    } as unknown as INestApplication;

    expect(() => configurarApp(appFalsa)).not.toThrow();
  });
});
