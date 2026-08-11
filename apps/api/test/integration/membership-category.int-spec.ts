import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { MembershipCategoryResponse } from "@polo/contracts";
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

describe("Categorías de membresía (T-243, HU-020-07)", () => {
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
      .post("/membership-categories")
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

    const slug = etiqueta("categorias").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club con categorías" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    tokenAdmin = await crearActor(club.id, "club_admin");
    tokenJugador = await crearActor(club.id, "player");
  });

  afterAll(async () => {
    await app.close();
  });

  it("crea una categoría con su cuota en centavos enteros (P-02)", async () => {
    const respuesta = await crear(tokenAdmin, {
      code: `socio-${etiqueta("c")}`,
      name: "Socio",
      monthlyFeeCents: 30000000,
      rights: { puede_inscribir_copas: true },
    });

    expect(respuesta.status).toBe(201);
    expect(MembershipCategoryResponse.safeParse(respuesta.body).success).toBe(true);
    expect(respuesta.body.monthlyFeeCents).toBe(30000000);
    expect(respuesta.body.active).toBe(true);
  });

  it("rechaza una cuota con decimales: el dinero es entero, siempre", async () => {
    const respuesta = await crear(tokenAdmin, {
      code: `decimal-${etiqueta("d")}`,
      name: "Con decimales",
      monthlyFeeCents: 1000.5,
    });

    expect(respuesta.status).toBe(400);
  });

  it("rechaza una cuota negativa", async () => {
    const respuesta = await crear(tokenAdmin, {
      code: `negativa-${etiqueta("n")}`,
      name: "Negativa",
      monthlyFeeCents: -1,
    });

    expect(respuesta.status).toBe(400);
  });

  it("no admite dos categorías con el mismo código en el club", async () => {
    const code = `repetido-${etiqueta("r")}`;
    await crear(tokenAdmin, { code, name: "Primera", monthlyFeeCents: 0 });

    const segunda = await crear(tokenAdmin, { code, name: "Segunda", monthlyFeeCents: 0 });

    expect(segunda.status).toBe(409);
  });

  it("cambiar la cuota no reescribe el pasado: la categoría conserva su identidad", async () => {
    // Hoy no hay módulo de pagos, así que lo que se comprueba es la mitad que ya existe: la
    // categoría es la misma fila y su valor nuevo rige de ahora en adelante. Los importes ya
    // emitidos quedarán congelados en su propio cobro (`docs/02` §A) cuando exista specs/100.
    const creada = await crear(tokenAdmin, {
      code: `sube-${etiqueta("s")}`,
      name: "Sube de precio",
      monthlyFeeCents: 10000000,
    });

    const actualizada = await request(app.getHttpServer())
      .patch(`/membership-categories/${creada.body.id}`)
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenAdmin))
      .send({ monthlyFeeCents: 12000000 });

    expect(actualizada.status).toBe(200);
    expect(actualizada.body.id).toBe(creada.body.id);
    expect(actualizada.body.monthlyFeeCents).toBe(12000000);
  });

  it("una categoría se desactiva, no se elimina (R-020-07)", async () => {
    // No hay ruta para eliminar: quien la tenga asignada la conserva, y su historia también.
    const creada = await crear(tokenAdmin, {
      code: `sale-${etiqueta("x")}`,
      name: "Se desactiva",
      monthlyFeeCents: 0,
    });

    const desactivada = await request(app.getHttpServer())
      .patch(`/membership-categories/${creada.body.id}`)
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenAdmin))
      .send({ active: false });

    expect(desactivada.body.active).toBe(false);
    expect(await prisma.membershipCategory.count({ where: { id: creada.body.id } })).toBe(1);
  });

  it("una categoría de otro club responde 404, nunca 403", async () => {
    const otroSlug = etiqueta("otro").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const otro = await prisma.club.create({ data: { slug: otroSlug, name: "Otro club" } });
    const ajena = await prisma.membershipCategory.create({
      data: { clubId: otro.id, code: "ajena", name: "Ajena", monthlyFeeCents: 0n, rights: {} },
    });

    const respuesta = await request(app.getHttpServer())
      .patch(`/membership-categories/${ajena.id}`)
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenAdmin))
      .send({ name: "Intento" });

    expect(respuesta.status).toBe(404);
  });

  it("un jugador no administra categorías, pero puede verlas", async () => {
    expect((await crear(tokenJugador, { code: "x", name: "X", monthlyFeeCents: 0 })).status).toBe(403);

    const lista = await request(app.getHttpServer())
      .get("/membership-categories")
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenJugador}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenJugador));

    expect(lista.status).toBe(200);
  });
});
