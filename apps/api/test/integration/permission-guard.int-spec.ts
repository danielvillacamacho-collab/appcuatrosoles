import "reflect-metadata";
import {
  Controller,
  Get,
  Module,
  Post,
  UseGuards,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { Clock, RoleName, ScopeKind } from "@polo/domain";
import { AuthModule } from "../../src/common/auth/auth.module.js";
import { CLOCK, ClockModule } from "../../src/common/clock/clock.module.js";
import type { ConTenant } from "../../src/tenant/tenant-context.js";
import { PermissionGuard } from "../../src/common/auth/permission.guard.js";
import { RequirePermission } from "../../src/common/auth/require-permission.js";
import { SessionGuard } from "../../src/common/auth/session.guard.js";
import {
  COOKIE_DE_SESION,
  crearTokenDeSesion,
  hashDeTokenDeSesion,
} from "../../src/common/auth/session-token.js";
import { PrismaModule } from "../../src/common/prisma/prisma.module.js";
import { CABECERA_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { configurarApp } from "../../src/configure-app.js";
import { crearClubDePrueba, etiqueta } from "../db.js";

@Controller("usuarios")
@UseGuards(SessionGuard, PermissionGuard)
class ControladorDeUsuarios {
  @Post()
  @RequirePermission("user.create")
  crear(): { creado: true } {
    return { creado: true };
  }

  /** Sin permiso declarado: leer no exige más que tener sesión. */
  @Get()
  listar(): { items: [] } {
    return { items: [] };
  }
}

/** Ruta de ámbito de organización: el permiso se evalúa contra ESA organización (T-223). */
@Controller("organizaciones")
@UseGuards(SessionGuard, PermissionGuard)
class ControladorDeOrganizaciones {
  @Post(":id/algo")
  @RequirePermission("organization.manage", { organizacion: { desde: "params", campo: "id" } })
  actuar(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [PrismaModule, ClockModule, AuthModule],
  controllers: [ControladorDeUsuarios, ControladorDeOrganizaciones],
})
class ModuloDeUsuarios {}

/**
 * **Andamiaje de prueba, no código de producción.** Simula lo que hará `TenantGuard` (T-020)
 * cuando exista: poner en la solicitud el club resuelto por subdominio. Aquí se toma de una
 * cabecera para poder probar también el caso en que **no hay tenant**. Un club que llega en una
 * cabecera del cliente sería exactamente lo que P-05 prohíbe; por eso vive en `test/`.
 */
function tenantDePrueba(req: Request & ConTenant, _res: Response, next: NextFunction): void {
  const club = req.headers["x-club-de-prueba"];

  if (typeof club === "string") {
    req.tenant = { clubId: club };
  }

  next();
}

describe("PermissionGuard (T-022b, docs/03 §6)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  async function crearActorCon(
    roles: { role: RoleName; scope: ScopeKind; scopeId: string | null }[],
    opciones: { revocados?: boolean } = {},
  ): Promise<string> {
    const marca = etiqueta("permiso");
    const clubId = await crearClubDePrueba(prisma);
    const persona = await prisma.person.create({
      data: { clubId, fullName: "Actor de prueba" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso-para-el-test",
        status: "active",
      },
    });

    const ahora = app.get<Clock>(CLOCK).now();

    for (const rol of roles) {
      await prisma.roleAssignment.create({
        data: {
          userAccountId: cuenta.id,
          role: rol.role,
          scope: rol.scope,
          scopeId: rol.scopeId,
          // Se otorga a sí mismo: en un test no hay nadie antes, igual que el primer
          // administrador del seed.
          grantedById: cuenta.id,
          ...(opciones.revocados === true
            ? { revokedAt: new Date(ahora.getTime() - 1000), revokedById: cuenta.id }
            : {}),
        },
      });
    }

    const token = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(token),
        expiresAt: new Date(ahora.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    return token;
  }

  function crear(token: string | null, club: string | null): request.Test {
    let peticion = request(app.getHttpServer()).post("/api/usuarios");

    if (token !== null) peticion = peticion.set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token));
    if (club !== null) peticion = peticion.set("x-club-de-prueba", club);

    return peticion;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [ModuloDeUsuarios] }).compile();
    app = configurarApp(moduleRef.createNestApplication());
    app.use(tenantDePrueba);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("deja pasar a quien tiene autoridad en ese club", () => {
    it("el administrador del club puede crear usuarios", async () => {
      const club = etiqueta("club");
      const token = await crearActorCon([{ role: "club_admin", scope: "club", scopeId: club }]);

      const respuesta = await crear(token, club);

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toEqual({ creado: true });
    });

    it("el superadministrador puede en cualquier club", async () => {
      const token = await crearActorCon([
        { role: "superadmin", scope: "platform", scopeId: null },
      ]);

      expect((await crear(token, etiqueta("club-cualquiera"))).status).toBe(201);
    });

    it("una ruta sin permiso declarado sólo exige sesión", async () => {
      const token = await crearActorCon([{ role: "player", scope: "club", scopeId: "club-x" }]);

      const respuesta = await request(app.getHttpServer())
        .get("/api/usuarios")
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token))
        .set("x-club-de-prueba", "club-x");

      expect(respuesta.status).toBe(200);
    });
  });

  describe("rechaza con 403 a quien tiene sesión pero no autoridad", () => {
    it("un jugador no crea usuarios", async () => {
      const club = etiqueta("club");
      const token = await crearActorCon([{ role: "player", scope: "club", scopeId: club }]);

      const respuesta = await crear(token, club);

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error.code).toBe("FORBIDDEN");
    });

    it("el comisario tampoco: su autoridad es deportiva, no administrativa", async () => {
      const club = etiqueta("club");
      const token = await crearActorCon([{ role: "commissioner", scope: "club", scopeId: club }]);

      expect((await crear(token, club)).status).toBe(403);
    });

    it("un administrador de organización no actúa sobre el club entero (R-010-04)", async () => {
      const club = etiqueta("club");
      const token = await crearActorCon([
        { role: "organization_admin", scope: "organization", scopeId: etiqueta("org") },
      ]);

      expect((await crear(token, club)).status).toBe(403);
    });

    it("un rol revocado no otorga nada — el retiro tiene efecto inmediato (T-061)", async () => {
      const club = etiqueta("club");
      const token = await crearActorCon([{ role: "club_admin", scope: "club", scopeId: club }], {
        revocados: true,
      });

      expect((await crear(token, club)).status).toBe(403);
    });
  });

  describe("aislamiento entre clubes (P-05)", () => {
    it("el administrador de un club no puede crear usuarios en otro", async () => {
      const suClub = etiqueta("club-propio");
      const otroClub = etiqueta("club-ajeno");
      const token = await crearActorCon([{ role: "club_admin", scope: "club", scopeId: suClub }]);

      expect((await crear(token, suClub)).status).toBe(201);
      expect((await crear(token, otroClub)).status).toBe(403);
    });
  });

  describe("ámbito de organización (T-223)", () => {
    async function crearOrganizacion(clubId: string, nombre: string): Promise<string> {
      const organizacion = await prisma.organization.create({
        data: { clubId, name: `${nombre}-${etiqueta("org")}`, type: "school" },
      });

      return organizacion.id;
    }

    function actuarSobre(organizacionId: string, token: string, club: string): request.Test {
      return request(app.getHttpServer())
        .post(`/api/organizaciones/${organizacionId}/algo`)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token))
        .set("x-club-de-prueba", club);
    }

    it("el administrador de una organización actúa sobre la suya", async () => {
      const club = await crearClubDePrueba(prisma, "con-org");
      const organizacionId = await crearOrganizacion(club, "propia");
      const token = await crearActorCon([
        { role: "organization_admin", scope: "organization", scopeId: organizacionId },
      ]);

      expect((await actuarSobre(organizacionId, token, club)).status).toBe(201);
    });

    it("pero no sobre otra organización del mismo club", async () => {
      const club = await crearClubDePrueba(prisma, "con-dos-orgs");
      const suya = await crearOrganizacion(club, "suya");
      const ajena = await crearOrganizacion(club, "ajena");
      const token = await crearActorCon([
        { role: "organization_admin", scope: "organization", scopeId: suya },
      ]);

      expect((await actuarSobre(suya, token, club)).status).toBe(201);
      expect((await actuarSobre(ajena, token, club)).status).toBe(403);
    });

    it("el administrador del club sí actúa sobre cualquier organización suya", async () => {
      const club = await crearClubDePrueba(prisma, "club-manda");
      const organizacionId = await crearOrganizacion(club, "cualquiera");
      const token = await crearActorCon([{ role: "club_admin", scope: "club", scopeId: club }]);

      expect((await actuarSobre(organizacionId, token, club)).status).toBe(201);
    });

    it("una organización de OTRO club responde 404, nunca 403 (P-05)", async () => {
      // Un 403 confirmaría que esa organización existe en algún lado, y entre inquilinos eso ya
      // es una fuga. La consulta va acotada por club_id: ni siquiera se lee la fila ajena.
      const club = await crearClubDePrueba(prisma, "mi-club");
      const otroClub = await crearClubDePrueba(prisma, "club-ajeno");
      const organizacionAjena = await crearOrganizacion(otroClub, "ajena");
      const token = await crearActorCon([{ role: "club_admin", scope: "club", scopeId: club }]);

      expect((await actuarSobre(organizacionAjena, token, club)).status).toBe(404);
    });

    it("una organización inexistente también responde 404", async () => {
      const club = await crearClubDePrueba(prisma, "sin-org");
      const token = await crearActorCon([{ role: "club_admin", scope: "club", scopeId: club }]);

      expect((await actuarSobre("no-existe", token, club)).status).toBe(404);
    });

    it("un jugador no actúa sobre ninguna organización", async () => {
      const club = await crearClubDePrueba(prisma, "club-jugador");
      const organizacionId = await crearOrganizacion(club, "cualquiera");
      const token = await crearActorCon([{ role: "player", scope: "club", scopeId: club }]);

      expect((await actuarSobre(organizacionId, token, club)).status).toBe(403);
    });
  });

  describe("falla cerrado cuando le falta contexto", () => {
    it("sin sesión responde 401, sin llegar a mirar permisos", async () => {
      const respuesta = await crear(null, etiqueta("club"));

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("sin tenant no concede ni miente: responde error interno, no 403", async () => {
      // Un 403 diría «no tienes permiso» cuando lo que pasa es que el servidor no sabe en qué club
      // está parado. Son problemas distintos y confundirlos manda a depurar al lado equivocado.
      const club = etiqueta("club");
      const token = await crearActorCon([{ role: "club_admin", scope: "club", scopeId: club }]);

      const respuesta = await crear(token, null);

      expect(respuesta.status).toBe(500);
      expect(respuesta.body.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
