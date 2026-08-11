import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { SettingResponse } from "@polo/contracts";
import { SETTING_CATALOG } from "@polo/domain";
import type { Clock, RoleName, ScopeKind } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
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
const EDAD = "identity.minor_profile_max_age";
const BLOQUEO = "auth.failed_login_lockout_minutes";

describe("Configuración (T-250 a T-253)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let organizacionId: string;
  let tokenAdminDelClub: string;
  let tokenSuperadmin: string;
  let tokenAdminDeOrg: string;
  let tokenJugador: string;

  async function crearActor(
    clubId: string,
    role: RoleName,
    scope: ScopeKind,
    scopeId: string | null,
  ): Promise<string> {
    const marca = etiqueta("actor");
    const persona = await prisma.person.create({ data: { clubId, fullName: "Actor" } });
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
    return {
      get: (ruta: string) =>
        request(app.getHttpServer())
          .get(ruta)
          .set("Host", `${club.slug}.${BASE}`)
          .set("Cookie", `${COOKIE_DE_SESION}=${token}`),
      put: (ruta: string) =>
        request(app.getHttpServer())
          .put(ruta)
          .set("Host", `${club.slug}.${BASE}`)
          .set("Cookie", `${COOKIE_DE_SESION}=${token}`),
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

    const slug = etiqueta("config").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club con configuración" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const organizacion = await prisma.organization.create({
      data: { clubId: club.id, name: `Escuela ${etiqueta("o")}`, type: "school" },
    });
    organizacionId = organizacion.id;

    tokenAdminDelClub = await crearActor(club.id, "club_admin", "club", club.id);
    tokenSuperadmin = await crearActor(club.id, "superadmin", "platform", null);
    tokenAdminDeOrg = await crearActor(club.id, "organization_admin", "organization", organizacionId);
    tokenJugador = await crearActor(club.id, "player", "club", club.id);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("leer (T-250)", () => {
    it("lista TODAS las claves del catálogo, incluidas las que nadie fijó nunca", async () => {
      // Una pantalla que sólo muestre lo que alguien tocó es una pantalla donde no se puede
      // descubrir qué se puede configurar.
      const respuesta = await con(tokenAdminDelClub).get("/settings");

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toHaveLength(Object.keys(SETTING_CATALOG).length);
      expect(respuesta.body.every((s: unknown) => SettingResponse.safeParse(s).success)).toBe(true);
    });

    it("una clave que nadie fijó viene con el default del catálogo y su origen", async () => {
      const respuesta = await con(tokenAdminDelClub).get(`/settings/${EDAD}`);

      expect(respuesta.body).toMatchObject({ key: EDAD, value: 18, source: "default", scope: null });
    });

    it("una clave inventada no existe", async () => {
      expect((await con(tokenAdminDelClub).get("/settings/practice.decision_time")).status).toBe(404);
    });
  });

  describe("fijar (T-251)", () => {
    it("fijar un valor lo devuelve como explícito del club", async () => {
      const respuesta = await con(tokenAdminDelClub).put(`/settings/${EDAD}`).send({ value: 21 });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({ value: 21, source: "explicit", scope: "club" });
    });

    it("rechaza un tipo equivocado al ESCRIBIR, no al leer", async () => {
      const respuesta = await con(tokenAdminDelClub)
        .put(`/settings/${EDAD}`)
        .send({ value: "dieciocho" });

      expect(respuesta.status).toBe(422);
    });

    it("rechaza una clave que no está en el catálogo (R-020-09)", async () => {
      const respuesta = await con(tokenAdminDelClub)
        .put("/settings/practice.decision_time")
        .send({ value: "18:00" });

      expect(respuesta.status).toBe(422);
    });

    it("un club no puede fijar una clave de plataforma", async () => {
      // Si cada club pudiera cambiar el bloqueo por intentos fallidos, dejaría de ser una regla de
      // la plataforma — y las reglas de la plataforma existen porque no son negociables.
      const respuesta = await con(tokenAdminDelClub).put(`/settings/${BLOQUEO}`).send({ value: 30 });

      expect(respuesta.status).toBe(422);
    });

    it("el superadministrador sí la fija, en su propia ruta", async () => {
      const respuesta = await con(tokenSuperadmin)
        .put(`/platform/settings/${BLOQUEO}`)
        .send({ value: 30 });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({ value: 30, scope: "platform", source: "explicit" });
    });

    it("un jugador no fija nada", async () => {
      expect((await con(tokenJugador).put(`/settings/${EDAD}`).send({ value: 30 })).status).toBe(403);
    });

    it("un administrador de club no fija configuración de plataforma ni por la otra ruta", async () => {
      const respuesta = await con(tokenAdminDelClub)
        .put(`/platform/settings/${BLOQUEO}`)
        .send({ value: 45 });

      expect(respuesta.status).toBe(403);
    });
  });

  describe("herencia entre ámbitos (R-020-10)", () => {
    it("la organización hereda del club, y el club de la plataforma", async () => {
      await con(tokenSuperadmin).put(`/platform/settings/${EDAD}`).send({ value: 21 });

      const enLaOrg = await con(tokenAdminDeOrg).get(`/organizations/${organizacionId}/settings`);
      const edadEnLaOrg = enLaOrg.body.find((s: { key: string }) => s.key === EDAD);

      // Hay un valor de club fijado antes en esta suite, así que gana ése y llega «heredado».
      expect(edadEnLaOrg).toMatchObject({ source: "inherited" });
    });

    it("una organización NO puede fijar una clave que es del club", async () => {
      // Es la regla del catálogo (T-212): el ámbito declarado es el más específico en el que se
      // puede fijar la clave. `identity.minor_profile_max_age` es de club, así que una
      // organización la hereda pero no la sobreescribe — si pudiera, dejaría de ser una decisión
      // del club. Hoy **ninguna clave del catálogo es de ámbito de organización**, así que esta
      // ruta sólo puede rechazar; el primer módulo que agregue una la estrenará.
      const respuesta = await con(tokenAdminDeOrg)
        .put(`/organizations/${organizacionId}/settings/${EDAD}`)
        .send({ value: 14 });

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe("UNPROCESSABLE");
    });

    it("y el ajeno tampoco: un administrador de otra organización no toca ésta", async () => {
      const otraOrg = await prisma.organization.create({
        data: { clubId: club.id, name: `Vecina ${etiqueta("v")}`, type: "team" },
      });
      const tokenAjeno = await crearActor(
        club.id,
        "organization_admin",
        "organization",
        otraOrg.id,
      );

      const respuesta = await con(tokenAjeno)
        .put(`/organizations/${organizacionId}/settings/${EDAD}`)
        .send({ value: 14 });

      expect(respuesta.status).toBe(403);
    });
  });

  describe("historia (T-252)", () => {
    it("el valor anterior sigue consultable y el histórico viene del más reciente al más viejo", async () => {
      const clave = EDAD;
      await con(tokenAdminDelClub).put(`/settings/${clave}`).send({
        value: 16,
        effectiveFrom: "2026-03-01T00:00:00.000Z",
      });
      await con(tokenAdminDelClub).put(`/settings/${clave}`).send({
        value: 17,
        effectiveFrom: "2026-06-01T00:00:00.000Z",
      });

      const historial = await con(tokenAdminDelClub).get(`/settings/${clave}/history`);

      expect(historial.status).toBe(200);
      expect(historial.body.length).toBeGreaterThanOrEqual(2);
      const fechas = historial.body.map((e: { effectiveFrom: string }) => e.effectiveFrom);
      expect([...fechas].sort().reverse()).toEqual(fechas);
    });

    it("preguntar por una fecha pasada devuelve lo que regía entonces, no lo de hoy", async () => {
      // Es lo que permite explicar un cobro viejo sin reconstruir nada.
      const enAbril = await con(tokenAdminDelClub).get(
        `/settings/${EDAD}?asOf=2026-04-15T00:00:00.000Z`,
      );

      expect(enAbril.body.value).toBe(16);
    });

    it("un valor con vigencia futura todavía no rige", async () => {
      await con(tokenAdminDelClub).put(`/settings/${EDAD}`).send({
        value: 99,
        effectiveFrom: "2099-01-01T00:00:00.000Z",
      });

      const hoy = await con(tokenAdminDelClub).get(`/settings/${EDAD}`);

      expect(hoy.body.value).not.toBe(99);
    });
  });

  describe("auditoría (T-253)", () => {
    it("cada cambio deja exactamente una fila, con el valor anterior y el nuevo", async () => {
      const antes = await prisma.auditLog.count({
        where: { entityId: EDAD, action: "setting.changed" },
      });

      await con(tokenAdminDelClub).put(`/settings/${EDAD}`).send({ value: 19 });

      const filas = await prisma.auditLog.findMany({
        where: { entityId: EDAD, action: "setting.changed" },
        orderBy: { occurredAt: "desc" },
      });

      expect(filas).toHaveLength(antes + 1);
      expect(filas[0]?.after).toMatchObject({ value: 19 });
      // El «antes» lo aporta el controlador: el interceptor no puede inferirlo (T-023).
      expect(filas[0]?.before).not.toBeNull();
    });

    it("un cambio rechazado no deja rastro: no hubo cambio que auditar", async () => {
      const antes = await prisma.auditLog.count({
        where: { entityId: EDAD, action: "setting.changed" },
      });

      await con(tokenAdminDelClub).put(`/settings/${EDAD}`).send({ value: "no es un número" });

      expect(
        await prisma.auditLog.count({ where: { entityId: EDAD, action: "setting.changed" } }),
      ).toBe(antes);
    });
  });
});
