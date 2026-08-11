import "reflect-metadata";
import { Controller, Get, Module, UseGuards, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { ClockModule } from "../../src/common/clock/clock.module.js";
import { AuthModule } from "../../src/common/auth/auth.module.js";
import { SessionGuard } from "../../src/common/auth/session.guard.js";
import { PrismaModule } from "../../src/common/prisma/prisma.module.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { TenantGuard } from "../../src/tenant/tenant.guard.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { TenantModule } from "../../src/tenant/tenant.module.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";

@Controller("quien-soy")
@UseGuards(TenantGuard)
class ControladorDeTenant {
  @Get()
  club(): { ok: true } {
    return { ok: true };
  }
}

/** Ruta protegida por los dos guards, en el orden real: tenant primero, sesión después. */
@Controller("protegido")
@UseGuards(TenantGuard, SessionGuard)
class ControladorProtegido {
  @Get()
  algo(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [PrismaModule, ClockModule, TenantModule, AuthModule],
  controllers: [ControladorDeTenant, ControladorProtegido],
  providers: [{ provide: BASE_DOMAIN, useValue: BASE }],
})
class ModuloDeTenant {}

describe("TenantGuard (T-221 · cierra T-020 de specs/010)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let directorio: ClubDirectory;
  let clubA: { id: string; slug: string };
  let clubB: { id: string; slug: string };
  let suspendido: { id: string; slug: string };

  function pedir(ruta: string, host: string | null): request.Test {
    const peticion = request(app.getHttpServer()).get(ruta);

    return host === null ? peticion : peticion.set("Host", host);
  }

  async function crearClub(prefijo: string, status: "active" | "suspended" = "active") {
    const slug = etiqueta(prefijo).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const club = await prisma.club.create({ data: { slug, name: `Club ${slug}`, status } });

    return { id: club.id, slug: club.slug };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [ModuloDeTenant] })
      // El módulo de tenant lee `BASE_DOMAIN` de `process.env`; aquí se sustituye por un dominio
      // de prueba sin tocar el entorno del proceso — que es la razón por la que es un token.
      .overrideProvider(BASE_DOMAIN)
      .useValue(BASE)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    directorio = app.get(ClubDirectory);

    clubA = await crearClub("club-a");
    clubB = await crearClub("club-b");
    suspendido = await crearClub("moroso", "suspended");
    directorio.invalidate();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("resuelve el club por su subdominio", () => {
    it("un host conocido pasa", async () => {
      const respuesta = await pedir("/quien-soy", `${clubA.slug}.${BASE}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ ok: true });
    });

    it("funciona con el puerto en el host, que es como llega en desarrollo", async () => {
      expect((await pedir("/quien-soy", `${clubA.slug}.${BASE}:5173`)).status).toBe(200);
    });
  });

  describe("responde 404 y no distingue por qué (R-020-02, P-12)", () => {
    const casos: { nombre: string; host: (contexto: { suspendidoSlug: string }) => string }[] = [
      { nombre: "un subdominio que no existe", host: () => `inventado.${BASE}` },
      { nombre: "el apex, sin subdominio", host: () => BASE },
      { nombre: "un host de otro dominio", host: () => `${"cualquiera"}.otrositio.com` },
      { nombre: "un subdominio de más nivel", host: () => `a.b.${BASE}` },
      { nombre: "www", host: () => `www.${BASE}` },
      { nombre: "un club suspendido", host: ({ suspendidoSlug }) => `${suspendidoSlug}.${BASE}` },
    ];

    for (const caso of casos) {
      it(`${caso.nombre} → 404`, async () => {
        const respuesta = await pedir("/quien-soy", caso.host({ suspendidoSlug: suspendido.slug }));

        expect(respuesta.status).toBe(404);
        expect(respuesta.body.error.code).toBe("NOT_FOUND");
      });
    }

    it("los seis rechazos son idénticos byte a byte", async () => {
      // Si el cuerpo delatara el motivo, un competidor podría averiguar desde afuera qué clubes
      // son clientes nuestros y cuáles dejaron de pagar. Se comparan sin el `requestId`, que es
      // distinto por definición en cada solicitud.
      const cuerpos: string[] = [];

      for (const caso of casos) {
        const { body } = await pedir("/quien-soy", caso.host({ suspendidoSlug: suspendido.slug }));
        const resto: Record<string, unknown> = { ...body.error };
        delete resto.requestId;

        cuerpos.push(JSON.stringify(resto));
      }

      expect(new Set(cuerpos).size).toBe(1);
    });

    it("sin cabecera Host tampoco resuelve", async () => {
      // HTTP/1.1 la exige, pero un cliente puede omitirla; el guard no debe romperse ni conceder.
      const respuesta = await pedir("/quien-soy", "");

      expect(respuesta.status).toBe(404);
    });
  });

  it("un host desconocido NO llega a consultar la tabla de sesiones (criterio de T-221)", async () => {
    // Es el criterio literal de la tarea, y la razón por la que el orden de los guards importa:
    // si el tenant se resolviera después, averiguar si una cuenta existe sería tan fácil como
    // preguntar desde un subdominio inventado.
    // El espía se ata explícitamente al original: `vi.spyOn` sobre un delegado de Prisma no
    // llama al método real por su cuenta —el delegado es un proxy— y devolver `undefined` haría
    // fallar al guard de sesión por una razón que no tiene nada que ver con lo que se prueba.
    const original = prisma.session.findUnique.bind(prisma.session);
    const espia = vi
      .spyOn(prisma.session, "findUnique")
      .mockImplementation(original as typeof prisma.session.findUnique);

    const respuesta = await pedir("/protegido", `inventado.${BASE}`).set(
      "Cookie",
      "polo_session=un-token-cualquiera",
    );

    expect(respuesta.status).toBe(404);
    expect(espia).not.toHaveBeenCalled();

    // Y con un host válido sí llega al guard de sesión, que es quien responde 401.
    const conHostValido = await pedir("/protegido", `${clubA.slug}.${BASE}`).set(
      "Cookie",
      "polo_session=un-token-cualquiera",
    );

    expect(conHostValido.status).toBe(401);
    expect(espia).toHaveBeenCalledTimes(1);

    espia.mockRestore();
  });

  it("dos clubes simultáneos no se cruzan (P-05)", async () => {
    // El test que exige la tarea. Dos hosts distintos, en la misma aplicación y con la misma
    // caché, tienen que resolver a clubes distintos — y ninguno al del otro.
    const respuestaA = await pedir("/quien-soy", `${clubA.slug}.${BASE}`);
    const respuestaB = await pedir("/quien-soy", `${clubB.slug}.${BASE}`);

    expect(respuestaA.status).toBe(200);
    expect(respuestaB.status).toBe(200);
    expect(clubA.id).not.toBe(clubB.id);

    // Y el club de uno no resuelve desde el subdominio del otro: un host sólo lleva a su club.
    const cruzado = await pedir("/quien-soy", `${clubA.slug}-x.${BASE}`);
    expect(cruzado.status).toBe(404);
  });

  it("suspender un club corta el acceso en cuanto se invalida la caché (R-020-04)", async () => {
    const club = await crearClub("se-suspende");
    directorio.invalidate();

    expect((await pedir("/quien-soy", `${club.slug}.${BASE}`)).status).toBe(200);

    await prisma.club.update({ where: { id: club.id }, data: { status: "suspended" } });
    directorio.invalidate();

    expect((await pedir("/quien-soy", `${club.slug}.${BASE}`)).status).toBe(404);
  });
});
