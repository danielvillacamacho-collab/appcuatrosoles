import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import {
  COOKIE_DE_SESION,
  crearTokenDeSesion,
  hashDeTokenDeSesion,
} from "../../src/common/auth/session-token.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";

/**
 * T-260 · Un club nuevo, de cero a operativo, en un solo recorrido.
 *
 * Es la medida de HU-020-02 —«horas, no días»— convertida en test: cada paso que este archivo
 * necesite hacer «a mano» contra la base de datos es un paso que en la vida real alguien tendría
 * que hacer por fuera de la plataforma. Hoy hay **uno**, y está marcado: la sesión del
 * superadministrador, porque el login (`specs/010` sección D) todavía no existe.
 *
 * **No es el E2E de navegador** que pide `docs/05` §7: `apps/web` no tiene todavía estas pantallas.
 * Este recorrido cubre el API de punta a punta; el de navegador entra cuando exista la interfaz.
 */
describe("Un club nuevo queda operativo (T-260, HU-020-02)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenSuperadmin: string;
  let slugNuevo: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DOMAIN)
      .useValue(BASE)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    // ── El único paso «a mano» ────────────────────────────────────────────────
    // Una sesión de superadministrador. En la vida real se obtiene con `POST /auth/login`, que es
    // T-030 de `specs/010`. Cuando exista, esta parte se reemplaza por la llamada real y este
    // recorrido pasa a no tocar la base para nada.
    const casa = await prisma.club.create({
      data: {
        slug: etiqueta("casa").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40),
        name: "Casa de la plataforma",
      },
    });
    const persona = await prisma.person.create({
      data: { clubId: casa.id, fullName: "Operadora de la plataforma" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${etiqueta("super")}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });
    await prisma.roleAssignment.create({
      data: {
        userAccountId: cuenta.id,
        role: "superadmin",
        scope: "platform",
        scopeId: null,
        grantedById: cuenta.id,
      },
    });
    tokenSuperadmin = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(tokenSuperadmin),
        expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
      },
    });

    slugNuevo = etiqueta("club-nuevo").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
  });

  afterAll(async () => {
    await app.close();
  });

  it("de cero a operativo: alta, subdominio, organización, temporada, categoría y configuración", async () => {
    const comoSuperadmin = (metodo: "post" | "get", ruta: string) =>
      request(app.getHttpServer())[metodo](ruta).set(
        "Cookie",
        `${COOKIE_DE_SESION}=${tokenSuperadmin}`,
      );

    // 1. Alta del club.
    const alta = await comoSuperadmin("post", "/platform/clubs").send({
      name: "Club Recién Nacido",
      slug: slugNuevo,
      timezone: "America/Bogota",
      currency: "COP",
      adminEmail: `${slugNuevo}-admin@ejemplo.test`,
      adminFullName: "Administradora del club nuevo",
    });

    expect(alta.status).toBe(201);
    const clubId: string = alta.body.id;

    // 2. El subdominio resuelve en el acto, sin esperar a que venza ninguna caché.
    const publico = await request(app.getHttpServer())
      .get("/clubs/current/public")
      .set("Host", `${slugNuevo}.${BASE}`);

    expect(publico.status).toBe(200);
    expect(publico.body.name).toBe("Club Recién Nacido");

    // 3. Su administrador entra y opera. (La sesión se arma igual que arriba, por lo mismo.)
    const cuentaAdmin = await prisma.userAccount.findUniqueOrThrow({
      where: { email: `${slugNuevo}-admin@ejemplo.test` },
    });
    await prisma.userAccount.update({ where: { id: cuentaAdmin.id }, data: { status: "active" } });
    const tokenAdmin = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuentaAdmin.id,
        tokenHash: hashDeTokenDeSesion(tokenAdmin),
        expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
      },
    });

    const comoAdmin = (metodo: "get" | "post" | "patch" | "put", ruta: string) =>
      request(app.getHttpServer())[metodo](ruta)
        .set("Host", `${slugNuevo}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`);

    // 4. El club nace con sus categorías y su temporada: no hay que crearlas.
    expect((await comoAdmin("get", "/membership-categories")).body).toHaveLength(5);
    expect((await comoAdmin("get", "/seasons")).body).toHaveLength(1);

    // 5. Crea su organización.
    const organizacion = await comoAdmin("post", "/organizations").send({
      name: "Escuela del club nuevo",
      type: "school",
    });
    expect(organizacion.status).toBe(201);

    // 6. Ajusta una categoría y una regla de configuración.
    const categorias = await comoAdmin("get", "/membership-categories");
    const socio = categorias.body.find((c: { code: string }) => c.code === "partner");
    const ajuste = await comoAdmin("patch", `/membership-categories/${socio.id}`).send({
      monthlyFeeCents: 45000000,
    });
    expect(ajuste.body.monthlyFeeCents).toBe(45000000);

    const configuracion = await comoAdmin("put", "/settings/identity.minor_profile_max_age").send({
      value: 17,
    });
    expect(configuracion.body).toMatchObject({ value: 17, source: "explicit", scope: "club" });

    // 7. Todo lo que hizo quedó auditado, y cada acción una sola vez.
    const auditoria = await prisma.auditLog.findMany({ where: { clubId } });
    const acciones = auditoria.map((fila) => fila.action);

    expect(acciones).toContain("organization.created");
    expect(acciones).toContain("membership_category.updated");
    expect(acciones).toContain("setting.changed");
    expect(acciones.filter((a) => a === "organization.created")).toHaveLength(1);

    // 8. Y nada de esto se ve desde otro club.
    const otroSlug = etiqueta("vecino").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    await comoSuperadmin("post", "/platform/clubs").send({
      name: "Club Vecino",
      slug: otroSlug,
      timezone: "America/Bogota",
      currency: "COP",
      adminEmail: `${otroSlug}-admin@ejemplo.test`,
      adminFullName: "Administrador vecino",
    });

    const orgsDesdeElVecino = await request(app.getHttpServer())
      .get("/organizations")
      .set("Host", `${otroSlug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenAdmin}`);

    // La cookie es válida, pero el club del subdominio es otro: el permiso se evalúa contra ése.
    expect(orgsDesdeElVecino.body).toEqual([]);
  });

  it("suspender el club corta el acceso por su subdominio", async () => {
    const club = await prisma.club.findFirstOrThrow({ where: { slug: slugNuevo } });

    await request(app.getHttpServer())
      .post(`/platform/clubs/${club.id}/suspend`)
      .set("Cookie", `${COOKIE_DE_SESION}=${tokenSuperadmin}`)
      .send({ reason: "Fin de la prueba" });

    const publico = await request(app.getHttpServer())
      .get("/clubs/current/public")
      .set("Host", `${slugNuevo}.${BASE}`);

    expect(publico.status).toBe(404);
  });
});
