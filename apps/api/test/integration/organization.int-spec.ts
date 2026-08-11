import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { OrganizationResponse } from "@polo/contracts";
import type { Clock, RoleName, ScopeKind } from "@polo/domain";
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

describe("Organizaciones del club (T-241, HU-020-05)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let otroClub: { id: string; slug: string };
  let tokenAdminDelClub: string;
  let tokenJugador: string;

  async function crearClub(prefijo: string) {
    const slug = etiqueta(prefijo).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: `Club ${prefijo}` } });

    return { id: creado.id, slug: creado.slug };
  }

  async function crearActor(
    clubId: string,
    role: RoleName,
    scope: ScopeKind,
    scopeId: string,
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

  function pedir(metodo: "get" | "post" | "patch", ruta: string, token: string, slug = club.slug) {
    const agente = request(app.getHttpServer());

    return agente[metodo](ruta)
      .set("Host", `${slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token));
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

    club = await crearClub("con-orgs");
    otroClub = await crearClub("club-vecino");
    app.get(ClubDirectory).invalidate();

    tokenAdminDelClub = await crearActor(club.id, "club_admin", "club", club.id);
    tokenJugador = await crearActor(club.id, "player", "club", club.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it("el administrador del club crea una organización", async () => {
    const respuesta = await pedir("post", "/api/organizations", tokenAdminDelClub).send({
      name: `Escuela ${etiqueta("e")}`,
      type: "school",
    });

    expect(respuesta.status).toBe(201);
    expect(OrganizationResponse.safeParse(respuesta.body).success).toBe(true);
    expect(respuesta.body.status).toBe("active");
  });

  it("no admite dos organizaciones con el mismo nombre en el club", async () => {
    const nombre = `Repetida ${etiqueta("r")}`;
    await pedir("post", "/api/organizations", tokenAdminDelClub).send({ name: nombre, type: "team" });

    const segunda = await pedir("post", "/api/organizations", tokenAdminDelClub).send({
      name: nombre,
      type: "team",
    });

    expect(segunda.status).toBe(409);
  });

  it("el mismo nombre sí se puede usar en otro club (P-05)", async () => {
    const nombre = `Escuela compartida ${etiqueta("s")}`;
    const tokenDelOtro = await crearActor(otroClub.id, "club_admin", "club", otroClub.id);

    const aqui = await pedir("post", "/api/organizations", tokenAdminDelClub).send({
      name: nombre,
      type: "school",
    });
    const alla = await pedir("post", "/api/organizations", tokenDelOtro, otroClub.slug).send({
      name: nombre,
      type: "school",
    });

    expect(aqui.status).toBe(201);
    expect(alla.status).toBe(201);
  });

  it("listar sólo devuelve las del club del subdominio", async () => {
    const tokenDelOtro = await crearActor(otroClub.id, "club_admin", "club", otroClub.id);
    const propia = await pedir("post", "/api/organizations", tokenAdminDelClub).send({
      name: `Sólo aquí ${etiqueta("p")}`,
      type: "service",
    });

    const listaAjena = await pedir("get", "/api/organizations", tokenDelOtro, otroClub.slug);

    expect(listaAjena.body.map((org: { id: string }) => org.id)).not.toContain(propia.body.id);
  });

  it("archivar conserva la organización y su historia, no la borra (R-020-07)", async () => {
    const creada = await pedir("post", "/api/organizations", tokenAdminDelClub).send({
      name: `Se archiva ${etiqueta("a")}`,
      type: "team",
    });

    const archivada = await pedir(
      "post",
      `/api/organizations/${creada.body.id}/archive`,
      tokenAdminDelClub,
    );

    expect(archivada.status).toBe(200);
    expect(archivada.body.status).toBe("archived");
    expect(archivada.body.archivedAt).not.toBeNull();
    expect(await prisma.organization.count({ where: { id: creada.body.id } })).toBe(1);
  });

  describe("aislamiento y permisos", () => {
    it("una organización de otro club responde 404, nunca 403", async () => {
      const ajena = await prisma.organization.create({
        data: { clubId: otroClub.id, name: `Ajena ${etiqueta("x")}`, type: "school" },
      });

      const respuesta = await pedir("patch", `/api/organizations/${ajena.id}`, tokenAdminDelClub).send({
        name: "Intento",
      });

      expect(respuesta.status).toBe(404);
    });

    it("un administrador de organización edita la suya", async () => {
      const propia = await prisma.organization.create({
        data: { clubId: club.id, name: `Suya ${etiqueta("s")}`, type: "school" },
      });
      const token = await crearActor(club.id, "organization_admin", "organization", propia.id);

      const respuesta = await pedir("patch", `/api/organizations/${propia.id}`, token).send({
        name: `Renombrada ${etiqueta("n")}`,
      });

      expect(respuesta.status).toBe(200);
    });

    it("pero no otra del mismo club, ni puede crear organizaciones nuevas", async () => {
      // Crear es de ámbito de club: si un administrador de organización pudiera crear otras, se
      // estaría ampliando el terreno por la puerta de al lado.
      const suya = await prisma.organization.create({
        data: { clubId: club.id, name: `Propia ${etiqueta("p")}`, type: "school" },
      });
      const vecina = await prisma.organization.create({
        data: { clubId: club.id, name: `Vecina ${etiqueta("v")}`, type: "school" },
      });
      const token = await crearActor(club.id, "organization_admin", "organization", suya.id);

      expect((await pedir("patch", `/api/organizations/${vecina.id}`, token).send({ name: "x" })).status).toBe(403);
      expect(
        (await pedir("post", "/api/organizations", token).send({ name: "Nueva", type: "team" })).status,
      ).toBe(403);
    });

    it("un jugador no crea ni edita organizaciones, pero sí puede listarlas", async () => {
      expect(
        (await pedir("post", "/api/organizations", tokenJugador).send({ name: "X", type: "team" }))
          .status,
      ).toBe(403);
      expect((await pedir("get", "/api/organizations", tokenJugador)).status).toBe(200);
    });

    it("sin sesión no se lista nada", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/api/organizations")
        .set("Host", `${club.slug}.${BASE}`);

      expect(respuesta.status).toBe(401);
    });
  });
});
