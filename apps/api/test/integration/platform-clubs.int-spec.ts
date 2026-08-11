import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { ClubResponse } from "@polo/contracts";
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
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { crearClubDePrueba, etiqueta } from "../db.js";

describe("Alta y suspensión de clubes (T-230, T-231)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenSuperadmin: string;
  let tokenAdminDeClub: string;

  /**
   * Crea una cuenta con un rol y su sesión. Para el ámbito de club usa **el club de la propia
   * persona**: un `club_admin` con `scope_id` nulo lo rechaza la base (T-002), y con razón — un
   * administrador de club tiene que serlo de alguno.
   */
  async function crearActor(rol: { role: RoleName; scope: ScopeKind }) {
    const marca = etiqueta("actor");
    const clubId = await crearClubDePrueba(prisma, "casa-del-actor");
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
        role: rol.role,
        scope: rol.scope,
        scopeId: rol.scope === "platform" ? null : clubId,
        grantedById: cuenta.id,
      },
    });

    const token = crearTokenDeSesion();
    const ahora = app.get<Clock>(CLOCK).now();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(token),
        expiresAt: new Date(ahora.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    return { token, cuentaId: cuenta.id, personaId: persona.id, clubId };
  }

  function crearClub(token: string, cuerpo: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .post("/platform/clubs")
      .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token))
      .send(cuerpo);
  }

  function datosDeClub(extra: Record<string, unknown> = {}): Record<string, unknown> {
    const marca = etiqueta("c").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);

    return {
      name: "Club Nuevo",
      slug: marca,
      timezone: "America/Bogota",
      currency: "COP",
      adminEmail: `${marca}@ejemplo.test`,
      adminFullName: "Primera administradora",
      ...extra,
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    tokenSuperadmin = (await crearActor({ role: "superadmin", scope: "platform" })).token;
    tokenAdminDeClub = (await crearActor({ role: "club_admin", scope: "club" })).token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("dar de alta un club (HU-020-02)", () => {
    it("queda activo, con sus categorías, su temporada abierta y su administrador invitado", async () => {
      const datos = datosDeClub();

      const respuesta = await crearClub(tokenSuperadmin, datos);

      expect(respuesta.status).toBe(201);
      expect(ClubResponse.safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body).toMatchObject({ slug: datos.slug, status: "active" });

      const clubId = respuesta.body.id;
      expect(await prisma.membershipCategory.count({ where: { clubId } })).toBe(5);

      const temporada = await prisma.season.findFirstOrThrow({ where: { clubId } });
      expect(temporada.status).toBe("open");

      // El administrador nace `invited`: define su contraseña al aceptar la invitación. El envío
      // del correo es T-050/T-090 de specs/010 y todavía no existe — ver el pendiente declarado.
      const cuenta = await prisma.userAccount.findUniqueOrThrow({
        where: { email: datos.adminEmail as string },
      });
      expect(cuenta.status).toBe("invited");

      const roles = await prisma.roleAssignment.findMany({ where: { userAccountId: cuenta.id } });
      expect(roles).toHaveLength(1);
      expect(roles[0]).toMatchObject({ role: "club_admin", scope: "club", scopeId: clubId });
    });

    it("el club nuevo resuelve por su subdominio en el acto, sin esperar a que venza la caché", async () => {
      const datos = datosDeClub();
      await crearClub(tokenSuperadmin, datos);

      const clubes = await app.get(ClubDirectory).all();

      expect(clubes.map((club) => club.slug)).toContain(datos.slug);
    });

    it("rechaza un slug ya usado", async () => {
      const datos = datosDeClub();
      await crearClub(tokenSuperadmin, datos);

      const repetido = await crearClub(tokenSuperadmin, datosDeClub({ slug: datos.slug }));

      expect(repetido.status).toBe(409);
    });

    it("rechaza un slug con forma inválida, diciendo cuál es el problema", async () => {
      const respuesta = await crearClub(tokenSuperadmin, datosDeClub({ slug: "Los Pinos" }));

      expect(respuesta.status).toBe(422);
    });

    it("rechaza un slug reservado", async () => {
      const respuesta = await crearClub(tokenSuperadmin, datosDeClub({ slug: "www" }));

      expect(respuesta.status).toBe(422);
    });

    it("rechaza una zona horaria inexistente", async () => {
      // Se valida contra `Intl`, no contra una lista propia: la base de zonas cambia y una lista
      // escrita a mano envejece sin que nadie se entere.
      const respuesta = await crearClub(tokenSuperadmin, datosDeClub({ timezone: "America/Polo" }));

      expect(respuesta.status).toBe(422);
    });

    it("rechaza un cuerpo que no cumple el contrato, con el detalle de los campos", async () => {
      const respuesta = await crearClub(tokenSuperadmin, { name: "", slug: "x" });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.code).toBe("VALIDATION_FAILED");
      expect(respuesta.body.error.details.fields).toHaveProperty("adminEmail");
    });

    it("no deja un club a medio crear cuando algo falla", async () => {
      // La transacción es lo que hace que un club con fila pero sin categorías —que parece que
      // existe— no llegue a ocurrir. Se provoca con un correo ya usado por otra cuenta.
      const primero = datosDeClub();
      await crearClub(tokenSuperadmin, primero);

      const segundo = datosDeClub({ adminEmail: primero.adminEmail });
      const respuesta = await crearClub(tokenSuperadmin, segundo);

      expect(respuesta.status).toBeGreaterThanOrEqual(400);
      expect(await prisma.club.findUnique({ where: { slug: segundo.slug as string } })).toBeNull();
    });

    it("un administrador de club no puede dar de alta clubes", async () => {
      const respuesta = await crearClub(tokenAdminDeClub, datosDeClub());

      expect(respuesta.status).toBe(403);
    });

    it("sin sesión, tampoco", async () => {
      const respuesta = await request(app.getHttpServer())
        .post("/platform/clubs")
        .send(datosDeClub());

      expect(respuesta.status).toBe(401);
    });
  });

  describe("suspender y reactivar (HU-020-04, R-020-04)", () => {
    async function clubConSesionViva() {
      const datos = datosDeClub();
      const { body } = await crearClub(tokenSuperadmin, datos);
      const persona = await prisma.person.create({
        data: { clubId: body.id, fullName: "Socia del club" },
      });
      const cuenta = await prisma.userAccount.create({
        data: {
          personId: persona.id,
          email: `${etiqueta("socia")}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      });
      const token = crearTokenDeSesion();
      const sesion = await prisma.session.create({
        data: {
          userAccountId: cuenta.id,
          tokenHash: hashDeTokenDeSesion(token),
          expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
        },
      });

      return { clubId: body.id as string, sesionId: sesion.id };
    }

    function suspender(clubId: string): request.Test {
      return request(app.getHttpServer())
        .post(`/platform/clubs/${clubId}/suspend`)
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenSuperadmin}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenSuperadmin))
        .send({ reason: "Terminó el contrato" });
    }

    it("suspender revoca las sesiones de su gente en el acto (R-020-04)", async () => {
      const { clubId, sesionId } = await clubConSesionViva();

      const respuesta = await suspender(clubId);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.status).toBe("suspended");

      const sesion = await prisma.session.findUniqueOrThrow({ where: { id: sesionId } });
      expect(sesion.revokedAt).not.toBeNull();
    });

    it("el club suspendido deja de resolver por su subdominio en el acto", async () => {
      const { clubId } = await clubConSesionViva();
      await suspender(clubId);

      const clubes = await app.get(ClubDirectory).all();

      expect(clubes.find((club) => club.id === clubId)?.status).toBe("suspended");
    });

    it("guarda desde cuándo y por qué, y lo conserva al reactivar", async () => {
      const { clubId } = await clubConSesionViva();
      await suspender(clubId);

      const suspendido = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });
      expect(suspendido.suspendedReason).toBe("Terminó el contrato");
      expect(suspendido.suspendedAt).not.toBeNull();

      await request(app.getHttpServer())
        .post(`/platform/clubs/${clubId}/reactivate`)
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenSuperadmin}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenSuperadmin))
        .send({});

      const reactivado = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });
      expect(reactivado.status).toBe("active");
      // La historia del corte se conserva: es justo lo que hace falta si meses después hay una
      // discusión contractual, y el estado ya dice que hoy está activo.
      expect(reactivado.suspendedReason).toBe("Terminó el contrato");
    });

    it("suspender un club inexistente responde 404", async () => {
      expect((await suspender("no-existe")).status).toBe(404);
    });

    it("cada acción deja exactamente una fila de auditoría", async () => {
      const { clubId } = await clubConSesionViva();
      await suspender(clubId);

      const filas = await prisma.auditLog.findMany({ where: { entityId: clubId } });
      const acciones = filas.map((fila) => fila.action);

      expect(acciones.filter((accion) => accion === "club.created")).toHaveLength(1);
      expect(acciones.filter((accion) => accion === "club.suspended")).toHaveLength(1);
    });
  });
});
