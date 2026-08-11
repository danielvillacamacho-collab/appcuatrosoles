import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { FieldResponse } from "@polo/contracts";
import type { Clock, RoleName } from "@polo/domain";
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

/** Una tarde de 2026, dentro del horario del club (6:00 a 18:00 en Bogotá). */
function alas(hora: string): string {
  return new Date(`2026-09-01T${hora}:00-05:00`).toISOString();
}

describe("Canchas y bloqueos (T-430 a T-441)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let tokenAdmin: string;
  let tokenComisario: string;
  let tokenJugador: string;

  async function crearActor(role: RoleName): Promise<string> {
    const marca = etiqueta("canchas");
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
        expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
      },
    });

    return token;
  }

  function con(token: string) {
    const base = (metodo: "get" | "post" | "patch" | "delete", ruta: string) => {
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
      delete: (r: string) => base("delete", r),
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

    const slug = etiqueta("canchas").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club de canchas" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    tokenAdmin = await crearActor("club_admin");
    tokenComisario = await crearActor("commissioner");
    tokenJugador = await crearActor("player");
  });

  afterAll(async () => {
    await app.close();
  });

  describe("listar y crear (T-430)", () => {
    it("cualquiera con sesión ve las canchas: es lo mínimo para leer el calendario", async () => {
      const respuesta = await con(tokenJugador).get("/api/fields");

      expect(respuesta.status).toBe(200);
      expect(FieldResponse.array().safeParse(respuesta.body).success).toBe(true);
    });

    it("el administrador crea una cancha", async () => {
      const respuesta = await con(tokenAdmin)
        .post("/api/fields")
        .send({ name: `Cancha ${etiqueta("n")}`, surface: "Grama" });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({ surface: "Grama", status: "active" });
    });

    it("un jugador no crea canchas", async () => {
      const respuesta = await con(tokenJugador)
        .post("/api/fields")
        .send({ name: `Cancha ${etiqueta("n")}` });

      expect(respuesta.status).toBe(403);
    });

    it("el comisario tampoco: su autoridad es deportiva, no administrativa", async () => {
      // Puede bloquear una franja porque la cancha está impracticable, pero no administrar canchas
      // (`docs/06` §4). Con un solo permiso para las dos cosas, esto pasaría.
      const respuesta = await con(tokenComisario)
        .post("/api/fields")
        .send({ name: `Cancha ${etiqueta("n")}` });

      expect(respuesta.status).toBe(403);
    });

    it("dos canchas del club no se llaman igual, y lo dice con su texto", async () => {
      const nombre = `Cancha ${etiqueta("dup")}`;
      await con(tokenAdmin).post("/api/fields").send({ name: nombre });

      const repetida = await con(tokenAdmin).post("/api/fields").send({ name: nombre });

      expect(repetida.status).toBe(409);
      expect(repetida.body.error.code).toBe("nombre_de_cancha_en_uso");
    });
  });

  describe("editar y archivar (T-431)", () => {
    it("archivar no borra: la cancha y lo programado en ella siguen existiendo", async () => {
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("arch")}` },
      });

      const respuesta = await con(tokenAdmin).post(`/api/fields/${cancha.id}/archive`);

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.status).toBe("archived");
      expect(await prisma.field.count({ where: { id: cancha.id } })).toBe(1);
    });

    it("una cancha archivada no aparece en el listado, pero se puede pedir", async () => {
      // Quien mira el calendario de marzo necesita saber en qué cancha fue esa práctica.
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("oculta")}`, status: "archived" },
      });

      const normal = await con(tokenAdmin).get("/api/fields");
      const conArchivadas = await con(tokenAdmin).get("/api/fields?incluirArchivadas=true");

      const ids = (r: { body: { id: string }[] }): string[] => r.body.map((c) => c.id);
      expect(ids(normal)).not.toContain(cancha.id);
      expect(ids(conArchivadas)).toContain(cancha.id);
    });

    it("una cancha en mantenimiento no admite reservas nuevas", async () => {
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("mant")}` },
      });
      await con(tokenAdmin).patch(`/api/fields/${cancha.id}`).send({ status: "maintenance" });

      const bloqueo = await con(tokenAdmin)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("16:00"), endsAt: alas("17:00"), reason: "Riego" });

      expect(bloqueo.status).toBe(422);
      expect(bloqueo.body.error.code).toBe("cancha_no_disponible");
    });

    it("el contrato no deja archivar por la puerta de atrás", async () => {
      // Archivar tiene su propia ruta y su propio registro de auditoría. Colarlo como un cambio de
      // campo lo haría parecer reversible y trivial, y es lo contrario.
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("pat")}` },
      });

      const respuesta = await con(tokenAdmin)
        .patch(`/api/fields/${cancha.id}`)
        .send({ status: "archived" });

      expect(respuesta.status).toBe(400);
    });

    it("una cancha de otro club responde 404, nunca 403 (P-05)", async () => {
      const ajeno = await prisma.club.create({
        data: { slug: `ajeno-${etiqueta("f")}`.toLowerCase().slice(0, 40), name: "Otro club" },
      });
      const canchaAjena = await prisma.field.create({
        data: { clubId: ajeno.id, name: "Cancha ajena" },
      });

      expect((await con(tokenAdmin).patch(`/api/fields/${canchaAjena.id}`).send({ name: "x" })).status).toBe(404);
      expect((await con(tokenAdmin).post(`/api/fields/${canchaAjena.id}/archive`)).status).toBe(404);
    });
  });

  describe("bloquear una franja (T-440)", () => {
    it("el comisario bloquea por condiciones de juego", async () => {
      // Es lo que su rol sí puede hacer: sacar una cancha de juego cuando está impracticable.
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("bloq")}` },
      });

      const respuesta = await con(tokenComisario)
        .post("/api/field-bookings/block")
        .send({
          fieldId: cancha.id,
          startsAt: alas("16:00"),
          endsAt: alas("17:00"),
          reason: "Cancha impracticable por lluvia",
        });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({ type: "maintenance", reason: "Cancha impracticable por lluvia" });
    });

    it("bloquear encima de algo existente se rechaza diciendo con qué choca", async () => {
      // El bloqueo **no atropella** lo programado: si hay que cancelar la práctica, eso se decide y
      // se hace explícitamente (HU-040-03).
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("choque")}` },
      });
      await con(tokenAdmin)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("16:00"), endsAt: alas("17:30"), reason: "Riego" });

      const encima = await con(tokenAdmin)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("17:00"), endsAt: alas("18:00"), reason: "Otro" });

      expect(encima.status).toBe(409);
      expect(encima.body.error.code).toBe("cancha_ocupada");
      expect(encima.body.error.details.ocupadoDesde).toBe(alas("16:00"));
    });

    it("el motivo es obligatorio: una franja ocupada sin motivo no la entiende nadie", async () => {
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("sinmotivo")}` },
      });

      const respuesta = await con(tokenAdmin)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("16:00"), endsAt: alas("17:00") });

      expect(respuesta.status).toBe(400);
    });

    it("un jugador no bloquea nada", async () => {
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("nojug")}` },
      });

      const respuesta = await con(tokenJugador)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("16:00"), endsAt: alas("17:00"), reason: "x" });

      expect(respuesta.status).toBe(403);
    });

    it("fuera del horario del club se rechaza", async () => {
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("horario")}` },
      });

      const respuesta = await con(tokenAdmin)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("04:00"), endsAt: alas("05:00"), reason: "Riego" });

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe("fuera_del_horario");
    });
  });

  describe("levantar el bloqueo (T-441)", () => {
    it("la franja queda disponible de inmediato", async () => {
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("libera")}` },
      });
      const bloqueo = await con(tokenAdmin)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("16:00"), endsAt: alas("17:00"), reason: "Riego" });

      expect((await con(tokenAdmin).delete(`/api/field-bookings/${bloqueo.body.id}`)).status).toBe(204);

      const otra = await con(tokenAdmin)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("16:00"), endsAt: alas("17:00"), reason: "Otro" });

      expect(otra.status).toBe(201);
    });

    it("levantar dos veces no falla: liberar algo ya liberado es un éxito", async () => {
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("dosveces")}` },
      });
      const bloqueo = await con(tokenAdmin)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("16:00"), endsAt: alas("17:00"), reason: "Riego" });

      await con(tokenAdmin).delete(`/api/field-bookings/${bloqueo.body.id}`);

      expect((await con(tokenAdmin).delete(`/api/field-bookings/${bloqueo.body.id}`)).status).toBe(204);
    });

    it("un jugador no levanta el bloqueo de nadie", async () => {
      const cancha = await prisma.field.create({
        data: { clubId: club.id, name: `Cancha ${etiqueta("nolev")}` },
      });
      const bloqueo = await con(tokenAdmin)
        .post("/api/field-bookings/block")
        .send({ fieldId: cancha.id, startsAt: alas("16:00"), endsAt: alas("17:00"), reason: "Riego" });

      expect((await con(tokenJugador).delete(`/api/field-bookings/${bloqueo.body.id}`)).status).toBe(403);
    });
  });
});
