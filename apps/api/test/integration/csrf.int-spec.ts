import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Clock } from "@polo/domain";
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

describe("Protección CSRF (T-025, docs/06 §1)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let token: string;
  let tokenDeOtraSesion: string;

  async function crearSesionDeAdmin(clubId: string): Promise<string> {
    const marca = etiqueta("csrf");
    const persona = await prisma.person.create({ data: { clubId, fullName: "Administradora" } });
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
        role: "club_admin",
        scope: "club",
        scopeId: clubId,
        grantedById: cuenta.id,
      },
    });

    const nuevo = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(nuevo),
        expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
      },
    });

    return nuevo;
  }

  function editarElClub() {
    return request(app.getHttpServer())
      .patch("/clubs/current")
      .set("Host", `${club.slug}.${BASE}`);
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

    const slug = etiqueta("csrf").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club con CSRF" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    token = await crearSesionDeAdmin(club.id);
    tokenDeOtraSesion = await crearSesionDeAdmin(club.id);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("una mutación con sesión exige el token", () => {
    it("sin la cabecera, se rechaza con 403", async () => {
      const respuesta = await editarElClub()
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .send({ name: "Cambio sin token" });

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error.code).toBe("CSRF_TOKEN_INVALIDO");
    });

    it("con la cabecera correcta, pasa", async () => {
      const respuesta = await editarElClub()
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token))
        .send({ name: "Cambio con token" });

      expect(respuesta.status).toBe(200);
    });

    it("con un token inventado, se rechaza", async () => {
      const respuesta = await editarElClub()
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, "a".repeat(64))
        .send({ name: "Cambio con token falso" });

      expect(respuesta.status).toBe(403);
    });

    it("con el token de OTRA sesión, se rechaza", async () => {
      // Es el caso que hace falta el doble envío **firmado**: el token está atado a la sesión, así
      // que uno válido de otra persona no sirve para actuar en nombre de ésta.
      const respuesta = await editarElClub()
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenDeOtraSesion))
        .send({ name: "Cambio con token ajeno" });

      expect(respuesta.status).toBe(403);
    });
  });

  describe("el ataque que la topología de subdominios hace posible", () => {
    it("una cookie de CSRF puesta por otro subdominio no alcanza: el token se deriva de la sesión", async () => {
      // Con doble envío **simple**, `otro-club.polo.app` escribe una cookie para `.polo.app` con
      // un valor que él elige y lo repite en la cabecera: la comparación pasa y la mutación se
      // ejecuta. Aquí el servidor no compara cookie contra cabecera — recalcula el token a partir
      // de la sesión, que el atacante no puede leer (`httpOnly`). Su cookie sobra y su cabecera
      // no coincide.
      const respuesta = await editarElClub()
        .set("Cookie", `${COOKIE_DE_SESION}=${token}; polo_csrf=valor-elegido-por-el-atacante`)
        .set(CABECERA_CSRF, "valor-elegido-por-el-atacante")
        .send({ name: "Cambio desde otro subdominio" });

      expect(respuesta.status).toBe(403);
    });
  });

  describe("lo que la protección NO toca", () => {
    it("una lectura no necesita token: un GET no cambia nada", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/clubs/current")
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`);

      expect(respuesta.status).toBe(200);
    });

    it("una mutación SIN sesión no necesita token: no hay autoridad que un tercero pueda usar", async () => {
      // Sin cookie de sesión no hay nada que CSRF pueda explotar — el ataque consiste en usar la
      // sesión de la víctima desde otro sitio. La ruta responde 401 por su cuenta, no 403.
      const respuesta = await editarElClub().send({ name: "Sin sesión" });

      expect(respuesta.status).toBe(401);
    });
  });
});
