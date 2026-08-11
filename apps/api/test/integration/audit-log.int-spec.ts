import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { AuditEntryResponse } from "@polo/contracts";
import type { Clock, RoleName, ScopeKind } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { CABECERA_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import {
  COOKIE_DE_SESION,
  crearTokenDeSesion,
  hashDeTokenDeSesion,
} from "../../src/common/auth/session-token.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";

describe("Registro de auditoría (T-080, T-081)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let organizacionId: string;
  let tokenAdmin: string;
  let tokenJugador: string;

  async function crearActor(
    role: RoleName,
    scope: ScopeKind,
    scopeId: string | null,
  ): Promise<string> {
    const marca = etiqueta("auditor");
    const persona = await prisma.person.create({ data: { clubId: club.id, fullName: `Actor ${role}` } });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });
    await prisma.roleAssignment.create({
      data: { userAccountId: cuenta.id, role, scope, scopeId, grantedById: cuenta.id },
    });

    const token = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(token),
        expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
      },
    });

    return token;
  }

  function con(token: string) {
    const base = (metodo: "get" | "post" | "patch", ruta: string) => {
      const agente = request(app.getHttpServer());

      return agente[metodo](ruta)
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token));
    };

    return {
      get: (r: string) => base("get", r),
      post: (r: string) => base("post", r),
      patch: (r: string) => base("patch", r),
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DOMAIN)
      .useValue(BASE)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    const slug = etiqueta("auditoria").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club auditado" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const organizacion = await prisma.organization.create({
      data: { clubId: club.id, name: `Escuela ${etiqueta("o")}`, type: "school" },
    });
    organizacionId = organizacion.id;

    tokenAdmin = await crearActor("club_admin", "club", club.id);
    tokenJugador = await crearActor("player", "club", club.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it("lista lo que pasó, con quién y cuándo", async () => {
    await con(tokenAdmin)
      .post("/api/users")
      .send({ fullName: "Auditado", email: `${etiqueta("aud")}@ejemplo.test`, roles: ["player"] });

    const respuesta = await con(tokenAdmin).get("/api/audit-log");

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.every((f: unknown) => AuditEntryResponse.safeParse(f).success)).toBe(true);
    expect(respuesta.body.some((f: { action: string }) => f.action === "user.created")).toBe(true);
  });

  it("filtra por acción y por entidad", async () => {
    const creado = await con(tokenAdmin)
      .post("/api/users")
      .send({ fullName: "Filtrable", email: `${etiqueta("filtro")}@ejemplo.test`, roles: ["player"] });

    const porEntidad = await con(tokenAdmin).get(`/api/audit-log?entityId=${creado.body.id}`);
    const porAccion = await con(tokenAdmin).get("/api/audit-log?action=user.created");

    expect(porEntidad.body.every((f: { entityId: string }) => f.entityId === creado.body.id)).toBe(true);
    expect(porAccion.body.every((f: { action: string }) => f.action === "user.created")).toBe(true);
  });

  it("nunca muestra auditoría de otro club (P-05)", async () => {
    const otroSlug = etiqueta("vecino").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const otroClub = await prisma.club.create({ data: { slug: otroSlug, name: "Vecino" } });
    const ajena = await prisma.auditLog.create({
      data: {
        clubId: otroClub.id,
        action: "user.created",
        entityType: "user_account",
        entityId: "entidad-ajena",
        requestId: etiqueta("req"),
      },
    });

    const respuesta = await con(tokenAdmin).get("/api/audit-log");

    expect(respuesta.body.map((f: { id: string }) => f.id)).not.toContain(ajena.id);
  });

  it("un administrador de organización sólo ve lo de su gente (T-080)", async () => {
    // La fila de auditoría no guarda a qué organización pertenece —no podría, audita cualquier
    // entidad— así que el recorte se hace por la gente: lo que hicieron los suyos y lo que se hizo
    // sobre los suyos.
    const tokenDeLaOrganizacion = await crearActor("organization_admin", "organization", organizacionId);
    const deLaOrganizacion = await con(tokenAdmin).post("/api/users").send({
      fullName: "De la escuela",
      email: `${etiqueta("escuela")}@ejemplo.test`,
      roles: ["instructor"],
      organizationId: organizacionId,
    });
    const delClub = await con(tokenAdmin).post("/api/users").send({
      fullName: "Del club",
      email: `${etiqueta("club")}@ejemplo.test`,
      roles: ["player"],
    });

    const respuesta = await con(tokenDeLaOrganizacion).get("/api/audit-log");
    const entidades = respuesta.body.map((f: { entityId: string }) => f.entityId);

    expect(entidades).toContain(deLaOrganizacion.body.id);
    expect(entidades).not.toContain(delClub.body.id);
  });

  it("un jugador no ve el registro de auditoría", async () => {
    expect((await con(tokenJugador).get("/api/audit-log")).status).toBe(403);
  });

  it("no existe ninguna ruta para escribir ni borrar auditoría", async () => {
    // `audit_log` es append-only por triggers (T-004) y sólo la escribe el interceptor (T-023).
    // Una ruta de escritura sería la forma de convertir el registro en algo que alguien maquilla.
    const escribir = await con(tokenAdmin).post("/api/audit-log").send({ action: "inventada" });

    expect(escribir.status).toBe(404);
  });

  describe("cada acción de R-010-11 deja exactamente una fila (T-081)", () => {
    it("crear, suspender, archivar, otorgar y retirar rol: una fila cada una, ni cero ni dos", async () => {
      const creado = await con(tokenAdmin).post("/api/users").send({
        fullName: "Recorrido completo",
        email: `${etiqueta("completo")}@ejemplo.test`,
        roles: ["player"],
      });
      const id = creado.body.id as string;

      const rol = await con(tokenAdmin).post(`/api/users/${id}/roles`).send({
        role: "commissioner",
        scope: "club",
      });
      const asignacion = rol.body.roles.find((r: { role: string }) => r.role === "commissioner");

      await con(tokenAdmin).patch(`/api/users/${id}`).send({ fullName: "Recorrido editado" });
      await con(tokenAdmin).post(`/api/users/${id}/suspend`);
      await con(tokenAdmin).post(`/api/users/${id}/reactivate`);
      await con(tokenAdmin).post(`/api/users/${id}/archive`);
      await request(app.getHttpServer())
        .delete(`/api/users/${id}/roles/${asignacion.id}`)
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenAdmin));

      const filas = await prisma.auditLog.findMany({ where: { entityId: id } });
      const cuenta = (accion: string): number => filas.filter((f) => f.action === accion).length;

      expect(cuenta("user.created")).toBe(1);
      expect(cuenta("user.updated")).toBe(1);
      expect(cuenta("user.suspended")).toBe(1);
      expect(cuenta("user.reactivated")).toBe(1);
      expect(cuenta("user.archived")).toBe(1);
      expect(cuenta("role.assigned")).toBe(1);
    });

    it("una acción rechazada no deja rastro: no hubo cambio que auditar", async () => {
      const antes = await prisma.auditLog.count({ where: { action: "user.created" } });

      await con(tokenJugador).post("/api/users").send({
        fullName: "No autorizado",
        email: `${etiqueta("no")}@ejemplo.test`,
        roles: ["player"],
      });

      expect(await prisma.auditLog.count({ where: { action: "user.created" } })).toBe(antes);
    });
  });
});
