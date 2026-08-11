import "reflect-metadata";
import {
  BadRequestException,
  Body,
  Controller,
  Module,
  Param,
  Post,
  Req,
  UseInterceptors,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { Clock } from "@polo/domain";
import { AuditInterceptor } from "../../src/common/audit/audit.interceptor.js";
import { AuditModule } from "../../src/common/audit/audit.module.js";
import { Auditable, anotarEstadoPrevio, type ConAuditoria } from "../../src/common/audit/auditable.js";
import { AuthModule } from "../../src/common/auth/auth.module.js";
import { RequirePermission } from "../../src/common/auth/require-permission.js";
import { CLOCK, ClockModule } from "../../src/common/clock/clock.module.js";
import type { ConSessionUser } from "../../src/common/auth/current-user.js";
import type { ConTenant } from "../../src/tenant/tenant-context.js";
import { PrismaModule } from "../../src/common/prisma/prisma.module.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { configurarApp } from "../../src/configure-app.js";
import { crearClubDePrueba, etiqueta } from "../db.js";

let CLUB = "";  // se llena en beforeAll: desde T-202 el club es una fila real

/**
 * Declara `@RequirePermission()` en el controlador entero **porque si no, la aplicación no
 * arranca**: la comprobación de T-022 alcanza también a los controladores de prueba, y lo
 * descubrió rechazando este archivo la primera vez que se corrió. No hay `@UseGuards` aquí: lo que
 * se está probando es la auditoría, no la autorización.
 */
@Controller("cosas")
@RequirePermission("user.create")
@UseInterceptors(AuditInterceptor)
class ControladorDeCosas {
  /** Creación: el identificador sale de la respuesta. */
  @Post()
  @Auditable({ action: "user.created", entityType: "user_account" })
  crear(@Body() cuerpo: { id?: string; nombre?: string }): {
    id: string;
    nombre: string;
    passwordHash: string;
  } {
    return {
      // El identificador lo elige el test para que cada caso mire sus propias filas: con uno fijo,
      // «exactamente una fila» pasaría a depender del orden en que corren los tests.
      id: cuerpo.id ?? "entidad-creada",
      nombre: cuerpo.nombre ?? "sin nombre",
      // A propósito: si el interceptor guardara la respuesta tal cual, esto quedaría en una tabla
      // que no se puede corregir ni borrar nunca.
      passwordHash: "argon2id$secreto-que-no-debe-quedar-registrado",
    };
  }

  /** Edición: el identificador sale de la ruta, y el servicio anota el estado previo. */
  @Post(":id/suspender")
  @Auditable({ action: "user.suspended", entityType: "user_account" })
  suspender(
    @Param("id") id: string,
    @Req() req: Request & ConAuditoria,
  ): { estado: string } {
    anotarEstadoPrevio(req, { estado: "active", id });

    return { estado: "suspended" };
  }

  /** Falla después de haber sido invocada: no hubo cambio, no hay nada que auditar. */
  @Post(":id/fallar")
  @Auditable({ action: "user.suspended", entityType: "user_account" })
  fallar(): never {
    throw new BadRequestException("no se pudo");
  }

  /** Sin `@Auditable()`: no debe escribir nada. */
  @Post("sin-marcar")
  sinMarcar(): { hecho: true } {
    return { hecho: true };
  }
}

@Module({
  imports: [PrismaModule, ClockModule, AuthModule, AuditModule],
  controllers: [ControladorDeCosas],
})
class ModuloDeCosas {}

/** Andamiaje: simula lo que hará `TenantGuard` (T-020). Ver la nota en `permission-guard.int-spec`. */
function contextoDePrueba(
  req: Request & ConTenant & ConSessionUser,
  _res: Response,
  next: NextFunction,
): void {
  req.tenant = { clubId: CLUB };

  const actor = req.headers["x-actor-de-prueba"];

  if (typeof actor === "string") {
    req.sessionUser = { userAccountId: actor, personId: "no-importa", sessionId: "no-importa" };
  }

  next();
}

describe("AuditInterceptor (T-023, docs/03 §9, R-010-11)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let actorId: string;

  async function filasDe(entityId: string): Promise<
    { action: string; actorUserId: string | null; clubId: string | null; requestId: string; before: unknown; after: unknown }[]
  > {
    return prisma.auditLog.findMany({
      where: { entityId },
      select: {
        action: true,
        actorUserId: true,
        clubId: true,
        requestId: true,
        before: true,
        after: true,
      },
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [ModuloDeCosas] }).compile();
    app = configurarApp(moduleRef.createNestApplication());
    app.use(contextoDePrueba);
    await app.init();
    prisma = app.get(PrismaService);

    CLUB = await crearClubDePrueba(prisma, "club-auditoria");
    const persona = await prisma.person.create({
      data: { clubId: CLUB, fullName: "Administradora de prueba" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${etiqueta("actor")}@ejemplo.test`,
        passwordHash: "argon2id$falso-para-el-test",
        status: "active",
      },
    });
    actorId = cuenta.id;

    // El reloj inyectado se usa aquí sólo para no llamar a `new Date()` (P-08, ESLint del repo).
    expect(app.get<Clock>(CLOCK).now()).toBeInstanceOf(Date);
  });

  afterAll(async () => {
    await app.close();
  });

  it("una mutación marcada genera exactamente una fila — ni cero ni dos (criterio de T-023)", async () => {
    const id = etiqueta("entidad-creada");
    const respuesta = await request(app.getHttpServer())
      .post("/api/cosas")
      .set("x-actor-de-prueba", actorId)
      .send({ id, nombre: "Petisero nuevo" });

    expect(respuesta.status).toBe(201);

    const filas = await filasDe(id);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ action: "user.created", actorUserId: actorId, clubId: CLUB });
  });

  it("el requestId de la fila es el mismo que recibió el cliente — es el hilo entre reclamo y rastro", async () => {
    const id = etiqueta("entidad-con-request");
    const respuesta = await request(app.getHttpServer())
      .post("/api/cosas")
      .set("x-actor-de-prueba", actorId)
      .send({ id, nombre: "Otro" });

    const filas = await filasDe(id);
    const requestIds = filas.map((fila) => fila.requestId);

    expect(requestIds).toContain(respuesta.headers["x-request-id"]);
  });

  it("nunca guarda un hash de contraseña, aunque venga en la respuesta", async () => {
    // `audit_log` es append-only (P-07): lo que entra no se corrige ni se borra, ni por el
    // superusuario de la base. Un secreto que se cuele queda ahí para siempre.
    const id = etiqueta("entidad-con-secreto");
    await request(app.getHttpServer())
      .post("/api/cosas")
      .set("x-actor-de-prueba", actorId)
      .send({ id, nombre: "Con secreto" });

    const filas = await filasDe(id);

    expect(JSON.stringify(filas)).not.toContain("argon2id$secreto");
    expect(JSON.stringify(filas)).not.toContain("passwordHash");
    expect(JSON.stringify(filas)).toContain("Con secreto");
  });

  it("guarda el antes y el después cuando el servicio anota el estado previo", async () => {
    const id = etiqueta("entidad-editada");

    await request(app.getHttpServer())
      .post(`/api/cosas/${id}/suspender`)
      .set("x-actor-de-prueba", actorId);

    const filas = await filasDe(id);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.before).toMatchObject({ estado: "active" });
    expect(filas[0]?.after).toMatchObject({ estado: "suspended" });
  });

  it("una mutación que falla no deja rastro: no hubo cambio que auditar", async () => {
    const id = etiqueta("entidad-fallida");

    const respuesta = await request(app.getHttpServer())
      .post(`/api/cosas/${id}/fallar`)
      .set("x-actor-de-prueba", actorId);

    expect(respuesta.status).toBe(400);
    expect(await filasDe(id)).toHaveLength(0);
  });

  it("una ruta sin @Auditable() no escribe nada", async () => {
    const antes = await prisma.auditLog.count();

    await request(app.getHttpServer()).post("/api/cosas/sin-marcar").set("x-actor-de-prueba", actorId);

    expect(await prisma.auditLog.count()).toBe(antes);
  });

  it("sin sesión, la fila queda con actor nulo: «el sistema», no «no sabemos quién»", async () => {
    const id = etiqueta("entidad-sin-actor");
    await request(app.getHttpServer()).post("/api/cosas").send({ id, nombre: "Sin actor" });

    const filas = await filasDe(id);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.actorUserId).toBeNull();
  });

  it("la fila escrita no se puede modificar ni borrar después (P-07, garantía de T-004)", async () => {
    const id = etiqueta("entidad-inmutable");

    await request(app.getHttpServer())
      .post(`/api/cosas/${id}/suspender`)
      .set("x-actor-de-prueba", actorId);

    await expect(
      prisma.auditLog.updateMany({ where: { entityId: id }, data: { action: "otra-cosa" } }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.deleteMany({ where: { entityId: id } })).rejects.toThrow();
    expect(await filasDe(id)).toHaveLength(1);
  });
});
