import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { SeasonResponse } from "@polo/contracts";
import type { Clock, RoleName } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import {
  COOKIE_DE_SESION,
  crearTokenDeSesion,
  hashDeTokenDeSesion,
} from "../../src/common/auth/session-token.js";
import { CABECERA_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";

describe("Temporadas (T-242, HU-020-06)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let tokenAdmin: string;
  let tokenJugador: string;

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

  function crear(token: string, cuerpo: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .post("/api/seasons")
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token))
      .send(cuerpo);
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

    const slug = etiqueta("temporadas").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club con temporadas" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    tokenAdmin = await crearActor(club.id, "club_admin");
    tokenJugador = await crearActor(club.id, "player");
  });

  afterAll(async () => {
    await app.close();
  });

  it("crea una temporada con fechas de calendario y la devuelve tal cual", async () => {
    const respuesta = await crear(tokenAdmin, {
      name: `Temporada ${etiqueta("t")}`,
      startsOn: "2030-01-01",
      endsOn: "2030-06-30",
    });

    expect(respuesta.status).toBe(201);
    expect(SeasonResponse.safeParse(respuesta.body).success).toBe(true);
    // El día no se corre: la columna es `date` y no se le aplica zona al serializar (lección T-014).
    expect(respuesta.body).toMatchObject({
      startsOn: "2030-01-01",
      endsOn: "2030-06-30",
      status: "open",
    });
  });

  it("rechaza una temporada solapada — y la rechaza la BASE, no el servicio (R-020-06)", async () => {
    await crear(tokenAdmin, {
      name: `Primera ${etiqueta("p")}`,
      startsOn: "2031-01-01",
      endsOn: "2031-06-30",
    });

    const solapada = await crear(tokenAdmin, {
      name: `Solapada ${etiqueta("s")}`,
      startsOn: "2031-06-01",
      endsOn: "2031-12-31",
    });

    expect(solapada.status).toBe(409);
  });

  it("permite temporadas consecutivas: la siguiente empieza al día siguiente", async () => {
    await crear(tokenAdmin, {
      name: `Primer semestre ${etiqueta("a")}`,
      startsOn: "2032-01-01",
      endsOn: "2032-06-30",
    });

    const segunda = await crear(tokenAdmin, {
      name: `Segundo semestre ${etiqueta("b")}`,
      startsOn: "2032-07-01",
      endsOn: "2032-12-31",
    });

    expect(segunda.status).toBe(201);
  });

  it("rechaza fechas incoherentes", async () => {
    const respuesta = await crear(tokenAdmin, {
      name: `Al revés ${etiqueta("r")}`,
      startsOn: "2033-12-31",
      endsOn: "2033-01-01",
    });

    expect(respuesta.status).toBe(422);
  });

  it("rechaza una fecha con formato de instante en vez de fecha de calendario", async () => {
    const respuesta = await crear(tokenAdmin, {
      name: `Con hora ${etiqueta("h")}`,
      startsOn: "2034-01-01T00:00:00Z",
      endsOn: "2034-12-31",
    });

    expect(respuesta.status).toBe(400);
  });

  it("cerrar una temporada conserva su historia y no admite cerrarla dos veces", async () => {
    const creada = await crear(tokenAdmin, {
      name: `Se cierra ${etiqueta("c")}`,
      startsOn: "2035-01-01",
      endsOn: "2035-12-31",
    });

    const cerrada = await request(app.getHttpServer())
      .post(`/api/seasons/${creada.body.id}/close`)
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenAdmin));

    expect(cerrada.status).toBe(200);
    expect(cerrada.body.status).toBe("closed");

    const otraVez = await request(app.getHttpServer())
      .post(`/api/seasons/${creada.body.id}/close`)
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenAdmin));

    expect(otraVez.status).toBe(409);
    expect(await prisma.season.count({ where: { id: creada.body.id } })).toBe(1);
  });

  it("dos clubes pueden tener temporadas en las mismas fechas (P-05)", async () => {
    const otroSlug = etiqueta("otro-club").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const otro = await prisma.club.create({ data: { slug: otroSlug, name: "Otro club" } });
    app.get(ClubDirectory).invalidate();
    const tokenDelOtro = await crearActor(otro.id, "club_admin");

    await crear(tokenAdmin, {
      name: `Compartida ${etiqueta("x")}`,
      startsOn: "2036-01-01",
      endsOn: "2036-12-31",
    });

    const enElOtro = await request(app.getHttpServer())
      .post("/api/seasons")
      .set("Host", `${otro.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenDelOtro}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenDelOtro))
      .send({ name: `Compartida ${etiqueta("y")}`, startsOn: "2036-01-01", endsOn: "2036-12-31" });

    expect(enElOtro.status).toBe(201);
  });

  it("un jugador no administra temporadas, pero puede verlas", async () => {
    expect(
      (await crear(tokenJugador, { name: "X", startsOn: "2037-01-01", endsOn: "2037-12-31" }))
        .status,
    ).toBe(403);

    const lista = await request(app.getHttpServer())
      .get("/api/seasons")
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenJugador}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenJugador));

    expect(lista.status).toBe(200);
  });
});
