import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { ClubPublicResponse, ClubResponse } from "@polo/contracts";
import type { Clock, RoleName } from "@polo/domain";
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

describe("Datos del club (T-240)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let otroClub: { id: string; slug: string };
  let tokenAdmin: string;
  let tokenJugador: string;

  function host(slug: string): string {
    return `${slug}.${BASE}`;
  }

  async function crearClub(prefijo: string) {
    const slug = etiqueta(prefijo).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: `Club ${prefijo}` } });

    return { id: creado.id, slug: creado.slug };
  }

  async function crearActor(clubId: string, role: RoleName): Promise<string> {
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
      data: {
        userAccountId: cuenta.id,
        role,
        scope: "club",
        scopeId: clubId,
        grantedById: cuenta.id,
      },
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

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DOMAIN)
      .useValue(BASE)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    club = await crearClub("propio");
    otroClub = await crearClub("ajeno");
    app.get(ClubDirectory).invalidate();

    tokenAdmin = await crearActor(club.id, "club_admin");
    tokenJugador = await crearActor(club.id, "player");
  });

  afterAll(async () => {
    await app.close();
  });

  describe("la ruta pública (HU-020-09)", () => {
    it("responde sin sesión, con el nombre del club del subdominio", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/clubs/current/public")
        .set("Host", host(club.slug));

      expect(respuesta.status).toBe(200);
      expect(ClubPublicResponse.safeParse(respuesta.body).success).toBe(true);
    });

    it("devuelve EXACTAMENTE dos campos — agregar uno rompe este test a propósito", async () => {
      // Es la única respuesta del sistema que se sirve sin sesión: todo campo que se agregue aquí
      // es información que cualquiera puede leer apuntando al subdominio.
      const respuesta = await request(app.getHttpServer())
        .get("/clubs/current/public")
        .set("Host", host(club.slug));

      expect(Object.keys(respuesta.body).sort()).toEqual(["name", "timezone"]);
    });

    it("no revela nada de otro club: cada subdominio ve el suyo", async () => {
      const propio = await request(app.getHttpServer())
        .get("/clubs/current/public")
        .set("Host", host(club.slug));
      const ajeno = await request(app.getHttpServer())
        .get("/clubs/current/public")
        .set("Host", host(otroClub.slug));

      expect(propio.body.name).not.toBe(ajeno.body.name);
    });

    it("desde un subdominio desconocido responde 404, no la lista de clubes", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/clubs/current/public")
        .set("Host", `inventado.${BASE}`);

      expect(respuesta.status).toBe(404);
    });
  });

  describe("el detalle y la edición", () => {
    it("con sesión devuelve el detalle completo del club", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/clubs/current")
        .set("Host", host(club.slug))
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenJugador}`);

      expect(respuesta.status).toBe(200);
      expect(ClubResponse.safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body.slug).toBe(club.slug);
    });

    it("sin sesión, el detalle no se sirve", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/clubs/current")
        .set("Host", host(club.slug));

      expect(respuesta.status).toBe(401);
    });

    it("un administrador cambia el nombre y la zona horaria", async () => {
      const respuesta = await request(app.getHttpServer())
        .patch("/clubs/current")
        .set("Host", host(club.slug))
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .send({ name: "Club Renombrado", timezone: "America/Argentina/Buenos_Aires" });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        name: "Club Renombrado",
        timezone: "America/Argentina/Buenos_Aires",
      });
    });

    it("el cambio se ve en el acto en la pantalla de ingreso", async () => {
      await request(app.getHttpServer())
        .patch("/clubs/current")
        .set("Host", host(club.slug))
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .send({ name: "Nombre Nuevo" });

      const publico = await request(app.getHttpServer())
        .get("/clubs/current/public")
        .set("Host", host(club.slug));

      expect(publico.body.name).toBe("Nombre Nuevo");
    });

    it("un jugador no edita el club", async () => {
      const respuesta = await request(app.getHttpServer())
        .patch("/clubs/current")
        .set("Host", host(club.slug))
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenJugador}`)
        .send({ name: "Intento" });

      expect(respuesta.status).toBe(403);
    });

    it("el administrador de un club no edita otro, aunque use su cookie en ese subdominio", async () => {
      // La cookie es válida; el club del subdominio es otro. El permiso se evalúa contra ESE club.
      const respuesta = await request(app.getHttpServer())
        .patch("/clubs/current")
        .set("Host", host(otroClub.slug))
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .send({ name: "Intento cruzado" });

      expect(respuesta.status).toBe(403);
    });

    it("rechaza una zona horaria inexistente", async () => {
      const respuesta = await request(app.getHttpServer())
        .patch("/clubs/current")
        .set("Host", host(club.slug))
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .send({ timezone: "America/Polo" });

      expect(respuesta.status).toBe(422);
    });

    it("el slug no se puede cambiar por aquí: el contrato lo ignora", async () => {
      // Cambiar el subdominio rompe enlaces y sesiones, así que es una operación de plataforma y
      // no una edición de perfil (R-020-03). El campo se descarta al validar el contrato.
      const respuesta = await request(app.getHttpServer())
        .patch("/clubs/current")
        .set("Host", host(club.slug))
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .send({ slug: "secuestrado" });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.slug).toBe(club.slug);
    });

    it("cada edición deja exactamente una fila de auditoría", async () => {
      const antes = await prisma.auditLog.count({
        where: { entityId: club.id, action: "club.updated" },
      });

      await request(app.getHttpServer())
        .patch("/clubs/current")
        .set("Host", host(club.slug))
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .send({ name: "Otro nombre" });

      expect(
        await prisma.auditLog.count({ where: { entityId: club.id, action: "club.updated" } }),
      ).toBe(antes + 1);
    });
  });
});
