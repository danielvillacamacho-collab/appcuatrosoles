import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Clock, RoleName } from "@polo/domain";
import { DependentResponse } from "@polo/contracts";
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

/** El reloj se fija: la edad del menor se calcula contra «hoy», y hoy no puede ser un dato movedizo. */
const HOY = new Date("2026-08-11T15:00:00.000Z");

describe("Perfiles de menores sin cuenta (T-076, HU-010-10)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let tokenAdmin: string;
  let tokenAcudiente: string;
  let personaAcudienteId: string;
  let personaOtroAcudienteId: string;
  let tokenOtroAcudiente: string;

  async function crearActor(role: RoleName): Promise<{ token: string; personaId: string }> {
    const marca = etiqueta("menores");
    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: `Actor ${role}` },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });
    await prisma.roleAssignment.create({
      data: { userAccountId: cuenta.id, role, scope: "club", scopeId: club.id, grantedById: cuenta.id },
    });

    const token = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(token),
        expiresAt: new Date(HOY.getTime() + 86_400_000),
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

  function crearMenor(cuerpo: Record<string, unknown>): request.Test {
    return con(tokenAdmin).post("/minors").send(cuerpo);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DOMAIN)
      .useValue(BASE)
      .overrideProvider(CLOCK)
      .useValue({ now: () => HOY } satisfies Clock)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    const slug = etiqueta("menores").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club de menores" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    tokenAdmin = (await crearActor("club_admin")).token;

    const acudiente = await crearActor("player");
    tokenAcudiente = acudiente.token;
    personaAcudienteId = acudiente.personaId;

    const otro = await crearActor("player");
    tokenOtroAcudiente = otro.token;
    personaOtroAcudienteId = otro.personaId;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("crear el perfil", () => {
    it("crea persona y vínculo juntos: un menor sin acudiente no llega a existir", async () => {
      // Partirlo en dos llamadas deja la puerta abierta a que la segunda no ocurra —se cayó la
      // red, falló el formulario— y que nadie se entere hasta que haya plata de por medio.
      const respuesta = await crearMenor({
        fullName: "Tomás Menor",
        birthdate: "2015-03-04",
        guardianPersonId: personaAcudienteId,
      });

      expect(respuesta.status).toBe(201);
      expect(DependentResponse.safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body).toMatchObject({
        fullName: "Tomás Menor",
        birthdate: "2015-03-04",
        isMinor: true,
        isPrimaryPayer: true,
      });

      const vinculos = await prisma.guardianship.findMany({
        where: { dependentPersonId: respuesta.body.personId },
      });
      expect(vinculos).toHaveLength(1);
      expect(vinculos[0]?.guardianPersonId).toBe(personaAcudienteId);
    });

    it("no le crea cuenta: ése es el punto de un perfil de menor", async () => {
      const respuesta = await crearMenor({
        fullName: "Sin contraseña",
        birthdate: "2016-06-06",
        guardianPersonId: personaAcudienteId,
      });

      const cuenta = await prisma.userAccount.findUnique({
        where: { personId: respuesta.body.personId },
      });

      expect(cuenta).toBeNull();
    });

    it("rechaza a un adulto: administrar a alguien que debería tener su propia contraseña", async () => {
      const respuesta = await crearMenor({
        fullName: "Persona mayor",
        birthdate: "1990-01-01",
        guardianPersonId: personaAcudienteId,
      });

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe("no_cabe_en_perfil_de_menor");
    });

    it("el límite de edad lo pone el club, no el código (P-04)", async () => {
      // Con 18 no cabe quien tiene 19; subiendo el ajuste a 21, el mismo perfil entra. Sin
      // desplegar nada.
      const nacimiento = "2006-01-01";

      expect((await crearMenor({ fullName: "De 20", birthdate: nacimiento, guardianPersonId: personaAcudienteId })).status).toBe(422);

      await prisma.setting.create({
        data: {
          scope: "club",
          scopeId: club.id,
          key: "identity.minor_profile_max_age",
          value: 21,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        },
      });

      expect((await crearMenor({ fullName: "De 20", birthdate: nacimiento, guardianPersonId: personaAcudienteId })).status).toBe(201);

      await prisma.setting.deleteMany({
        where: { scope: "club", scopeId: club.id, key: "identity.minor_profile_max_age" },
      });
    });

    it("un acudiente de otro club no existe desde aquí: 404, nunca 403 (P-05)", async () => {
      const ajeno = await prisma.club.create({
        data: { slug: `ajeno-${etiqueta("m")}`.toLowerCase().slice(0, 40), name: "Otro club" },
      });
      const personaAjena = await prisma.person.create({
        data: { clubId: ajeno.id, fullName: "Acudiente ajeno" },
      });

      const respuesta = await crearMenor({
        fullName: "Menor con acudiente ajeno",
        birthdate: "2015-01-01",
        guardianPersonId: personaAjena.id,
      });

      expect(respuesta.status).toBe(404);
    });

    it("un jugador cualquiera no da de alta gente en el club", async () => {
      const respuesta = await con(tokenAcudiente)
        .post("/minors")
        .send({ fullName: "No debería", birthdate: "2015-01-01", guardianPersonId: personaAcudienteId });

      expect(respuesta.status).toBe(403);
    });

    it("una fecha de nacimiento mal formada la para el contrato", async () => {
      const respuesta = await crearMenor({
        fullName: "Fecha rara",
        birthdate: "4 de marzo de 2015",
        guardianPersonId: personaAcudienteId,
      });

      expect(respuesta.status).toBe(400);
    });

    it("deja rastro en auditoría con el menor como entidad", async () => {
      const respuesta = await crearMenor({
        fullName: "Auditado",
        birthdate: "2017-07-07",
        guardianPersonId: personaAcudienteId,
      });

      const filas = await prisma.auditLog.findMany({
        where: { action: "minor_profile.created", entityId: respuesta.body.personId },
      });

      expect(filas).toHaveLength(1);
    });
  });

  describe("los perfiles a cargo (`GET /me/dependents`)", () => {
    it("el acudiente ve a los suyos y sabe si le van a cobrar", async () => {
      // Es la pregunta que trae a alguien a esta pantalla: «¿a mí me van a cobrar lo de este niño?»
      const respuesta = await con(tokenAcudiente).get("/me/dependents");

      expect(respuesta.status).toBe(200);
      expect(DependentResponse.array().safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body.length).toBeGreaterThan(0);
      expect(
        respuesta.body.every((fila: { isMinor: boolean; isPrimaryPayer: boolean }) => fila.isMinor),
      ).toBe(true);
    });

    it("quien no es acudiente de nadie ve una lista vacía, no un error", async () => {
      const respuesta = await con(tokenOtroAcudiente).get("/me/dependents");

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([]);
    });

    it("no muestra a los hijos de otro: el recorte lo hace el vínculo, no el rol", async () => {
      const mio = await crearMenor({
        fullName: "Hijo del primero",
        birthdate: "2018-02-02",
        guardianPersonId: personaAcudienteId,
      });

      const ajenos = await con(tokenOtroAcudiente).get("/me/dependents");

      expect(ajenos.body.map((fila: { personId: string }) => fila.personId)).not.toContain(
        mio.body.personId,
      );
    });

    it("un vínculo terminado deja de mostrarse", async () => {
      // Un acudiente que dejó de serlo el mes pasado no tiene por qué seguir viendo la ficha.
      const menor = await crearMenor({
        fullName: "Vínculo que termina",
        birthdate: "2019-09-09",
        guardianPersonId: personaOtroAcudienteId,
      });

      // La base exige `ends_on > starts_on`, así que se mueve el vínculo entero al pasado: lo que
      // se prueba es que un vínculo terminado no aparece, no cómo se termina.
      await prisma.guardianship.updateMany({
        where: { dependentPersonId: menor.body.personId },
        data: {
          startsOn: new Date("2026-07-01T00:00:00.000Z"),
          endsOn: new Date("2026-08-01T00:00:00.000Z"),
        },
      });

      const despues = await con(tokenOtroAcudiente).get("/me/dependents");

      expect(despues.body.map((fila: { personId: string }) => fila.personId)).not.toContain(
        menor.body.personId,
      );
    });

    it("el segundo acudiente ve al menor, pero sabe que no es él quien paga", async () => {
      const menor = await crearMenor({
        fullName: "Con dos acudientes",
        birthdate: "2014-04-04",
        guardianPersonId: personaAcudienteId,
      });

      await con(tokenAdmin).post("/guardianships").send({
        guardianPersonId: personaOtroAcudienteId,
        dependentPersonId: menor.body.personId,
        isPrimaryPayer: false,
        startsOn: "2026-08-11",
      });

      const suyos = await con(tokenOtroAcudiente).get("/me/dependents");
      const fila = suyos.body.find(
        (candidata: { personId: string }) => candidata.personId === menor.body.personId,
      );

      expect(fila.isPrimaryPayer).toBe(false);
    });

    it("sin sesión no hay perfiles a cargo", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/me/dependents")
        .set("Host", `${club.slug}.${BASE}`);

      expect(respuesta.status).toBe(401);
    });
  });
});
