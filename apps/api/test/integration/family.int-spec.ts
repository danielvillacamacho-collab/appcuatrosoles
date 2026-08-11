import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Clock, RoleName } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { CABECERA_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import {
  COOKIE_DE_SESION,
  crearTokenDeSesion,
  hashDeTokenDeSesion,
} from "../../src/common/auth/session-token.js";
import { GuardianshipsService } from "../../src/family/guardianships.service.js";
import { WaiversService } from "../../src/family/waivers.service.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";

describe("Familias, membresía y waivers (sección H)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let tokenAdmin: string;
  let personaAdminId: string;
  let tokenJugador: string;
  let personaJugadorId: string;

  async function crearActor(role: RoleName): Promise<{ token: string; personaId: string }> {
    const marca = etiqueta("familia");
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
      data: {
        userAccountId: cuenta.id,
        role,
        scope: "club",
        scopeId: club.id,
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

    return { token, personaId: persona.id };
  }

  function con(token: string) {
    const base = (metodo: "get" | "post", ruta: string) => {
      const agente = request(app.getHttpServer());

      return agente[metodo](ruta)
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token));
    };

    return { get: (r: string) => base("get", r), post: (r: string) => base("post", r) };
  }

  async function crearMenor(): Promise<string> {
    const menor = await prisma.person.create({
      data: { clubId: club.id, fullName: "Menor del club", isMinor: true },
    });

    return menor.id;
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

    const slug = etiqueta("familia").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club de familias" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const admin = await crearActor("club_admin");
    tokenAdmin = admin.token;
    personaAdminId = admin.personaId;
    const jugador = await crearActor("player");
    tokenJugador = jugador.token;
    personaJugadorId = jugador.personaId;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("acudientes y pagador principal (T-070, R-010-10)", () => {
    it("crea el vínculo y marca al pagador principal", async () => {
      const menor = await crearMenor();

      const respuesta = await con(tokenAdmin).post("/api/guardianships").send({
        guardianPersonId: personaAdminId,
        dependentPersonId: menor,
        isPrimaryPayer: true,
        startsOn: "2026-01-01",
      });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.isPrimaryPayer).toBe(true);
    });

    it("un pagador nuevo cierra el anterior: nunca hay dos vigentes", async () => {
      // El invariante «exactamente uno vigente» no cabe en un CHECK —depende de la fecha— así que
      // lo sostiene esta operación más el índice único parcial de T-003.
      const menor = await crearMenor();
      const segundoAcudiente = await prisma.person.create({
        data: { clubId: club.id, fullName: "Segundo acudiente" },
      });

      await con(tokenAdmin).post("/api/guardianships").send({
        guardianPersonId: personaAdminId,
        dependentPersonId: menor,
        isPrimaryPayer: true,
        startsOn: "2026-01-01",
      });
      const segundo = await con(tokenAdmin).post("/api/guardianships").send({
        guardianPersonId: segundoAcudiente.id,
        dependentPersonId: menor,
        isPrimaryPayer: true,
        startsOn: "2026-06-01",
      });

      expect(segundo.status).toBe(201);

      const vigentes = await prisma.guardianship.count({
        where: { dependentPersonId: menor, isPrimaryPayer: true, endsOn: null },
      });
      expect(vigentes).toBe(1);
    });

    it("nadie es acudiente de sí mismo", async () => {
      const respuesta = await con(tokenAdmin).post("/api/guardianships").send({
        guardianPersonId: personaAdminId,
        dependentPersonId: personaAdminId,
        startsOn: "2026-01-01",
      });

      expect(respuesta.status).toBe(422);
    });

    it("una persona de otro club responde 404 (P-05)", async () => {
      const otroSlug = etiqueta("vecino").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
      const otroClub = await prisma.club.create({ data: { slug: otroSlug, name: "Vecino" } });
      const ajena = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Ajena" },
      });

      const respuesta = await con(tokenAdmin).post("/api/guardianships").send({
        guardianPersonId: personaAdminId,
        dependentPersonId: ajena.id,
        startsOn: "2026-01-01",
      });

      expect(respuesta.status).toBe(404);
    });

    it("el job de integridad detecta al menor sin pagador vigente (T-071)", async () => {
      // No corrige nada: un job que decide quién paga estaría decidiendo por una persona.
      const menor = await crearMenor();
      await prisma.guardianship.create({
        data: {
          clubId: club.id,
          guardianPersonId: personaAdminId,
          dependentPersonId: menor,
          isPrimaryPayer: false,
          startsOn: new Date("2026-01-01"),
        },
      });

      const problemas = await app
        .get(GuardianshipsService)
        .revisarIntegridadDePagadores(club.id, "America/Bogota");

      expect(problemas.some((p) => p.dependentPersonId === menor && p.motivo === "no_primary_payer")).toBe(
        true,
      );
    });
  });

  describe("waivers (T-073 a T-075)", () => {
    it("publicar crea la versión siguiente y queda vigente", async () => {
      const primera = await con(tokenAdmin).post("/api/waivers").send({ body: "Texto de la versión" });

      expect(primera.status).toBe(201);
      expect(primera.body.version).toBeGreaterThanOrEqual(1);

      const vigente = await con(tokenJugador).get("/api/waivers/current");
      expect(vigente.body.id).toBe(primera.body.id);
    });

    it("un jugador no publica waivers", async () => {
      expect((await con(tokenJugador).post("/api/waivers").send({ body: "no" })).status).toBe(403);
    });

    it("aceptar deja a la persona cubierta, y publicar una versión nueva la descubre (R-010-12)", async () => {
      const servicio = app.get(WaiversService);

      await con(tokenAdmin).post("/api/waivers").send({ body: "Versión que se acepta" });
      await con(tokenJugador).post("/api/waivers/current/accept").send({});

      expect(await servicio.tieneWaiverVigente(club.id, personaJugadorId)).toBe(true);

      await con(tokenAdmin).post("/api/waivers").send({ body: "Versión nueva del club" });

      // La aceptación anterior era de otra versión: se vuelve a pedir (HU-010-11, segundo criterio).
      expect(await servicio.tieneWaiverVigente(club.id, personaJugadorId)).toBe(false);
    });

    it("aceptar dos veces la misma versión no falla ni duplica", async () => {
      await con(tokenAdmin).post("/api/waivers").send({ body: "Doble clic" });

      expect((await con(tokenJugador).post("/api/waivers/current/accept").send({})).status).toBe(204);
      expect((await con(tokenJugador).post("/api/waivers/current/accept").send({})).status).toBe(204);

      const vigente = await con(tokenJugador).get("/api/waivers/current");
      const aceptaciones = await prisma.waiverAcceptance.count({
        where: { personId: personaJugadorId, waiverVersionId: vigente.body.id as string },
      });
      expect(aceptaciones).toBe(1);
    });

    it("un acudiente acepta por su menor; alguien más, no (T-074)", async () => {
      await con(tokenAdmin).post("/api/waivers").send({ body: "Para el menor" });
      const menor = await crearMenor();
      await con(tokenAdmin).post("/api/guardianships").send({
        guardianPersonId: personaAdminId,
        dependentPersonId: menor,
        isPrimaryPayer: true,
        startsOn: "2026-01-01",
      });

      const porElAcudiente = await con(tokenAdmin)
        .post("/api/waivers/current/accept")
        .send({ personId: menor });
      const porUnExtraño = await con(tokenJugador)
        .post("/api/waivers/current/accept")
        .send({ personId: menor });

      expect(porElAcudiente.status).toBe(204);
      expect(porUnExtraño.status).toBe(403);
    });

    it("el ayudante reutilizable dice que sí cuando el club no tiene waiver publicado (T-075)", async () => {
      // Sin waiver no hay nada que aceptar: el club todavía no lo exige, y bloquear a todo el mundo
      // por una tabla vacía sería el sistema estorbando.
      const otroSlug = etiqueta("sin-waiver").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
      const sinWaiver = await prisma.club.create({ data: { slug: otroSlug, name: "Sin waiver" } });
      const persona = await prisma.person.create({
        data: { clubId: sinWaiver.id, fullName: "Alguien" },
      });

      expect(await app.get(WaiversService).tieneWaiverVigente(sinWaiver.id, persona.id)).toBe(true);
    });
  });
});
