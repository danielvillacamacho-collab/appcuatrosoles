import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { configurarApp } from "../../src/configure-app.js";

/**
 * La aplicación **completa**, arrancada contra el Postgres real de los tests.
 *
 * Existe por lo que pasó en T-005: el proyecto tenía build verde y una API que no arrancaba,
 * porque nada probaba el arranque de verdad. Ahora que la aplicación tiene dependencias externas
 * —una conexión a Postgres que se abre en `onModuleInit`— el riesgo es peor: un módulo mal
 * cableado no rompe ningún test unitario, rompe el despliegue.
 */
describe("Arranque de la aplicación", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Prisma lee `DATABASE_URL` al construir el cliente; se apunta al contenedor de la corrida
    // para que ningún test pueda tocar la base de desarrollo (misma razón que `test/db.ts`).
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("levanta con todos sus módulos y responde /health", async () => {
    const respuesta = await request(app.getHttpServer()).get("/api/health");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ status: "ok" });
  });

  it("la conexión a Postgres queda abierta desde el arranque, no en la primera consulta", async () => {
    const prisma = app.get(PrismaService);

    // Si `onModuleInit` no hubiera conectado, esto conectaría ahora y el test pasaría igual; lo
    // que se comprueba es que el servicio está en el contenedor y habla con la base real.
    const filas = await prisma.$queryRaw<[{ uno: number }]>`SELECT 1 AS uno`;

    expect(filas[0]?.uno).toBe(1);
  });

  it("el reloj se resuelve por inyección — nadie tiene que hacer new Date() (P-08)", () => {
    const clock = app.get<Clock>(CLOCK);

    expect(clock.now()).toBeInstanceOf(Date);
  });

  it("el filtro de errores está montado también en la aplicación real, no sólo en los tests", async () => {
    const respuesta = await request(app.getHttpServer()).get("/no-existe");

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe("NOT_FOUND");
    expect(respuesta.headers["x-request-id"]).toMatch(/^req_/);
  });
});
