import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
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
import { CABECERA_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";

/**
 * ADR-014 punto 3 · `docs/01` §6 — **una prueba de aislamiento por cada ruta registrada**.
 *
 * Lo que hace este archivo no es sólo probar unas rutas: **enumera las que la aplicación tiene
 * montadas** y exige que cada una esté declarada abajo. Una ruta nueva sin su caso de aislamiento
 * hace fallar esta suite, que es lo que pide el ADR — el objetivo es que nadie pueda agregar un
 * endpoint que lea datos de un club sin haber pensado qué pasa si lo llama otro.
 */

/**
 * Rutas cuyo aislamiento se prueba en su propio archivo, porque no encaja en el recorrido genérico
 * de abajo (necesitan un cuerpo válido y propio para significar algo).
 *
 * `POST /auth/login` está aquí, y su caso lo cubre `auth-login.int-spec`: **una cuenta de otro club
 * no entra por este subdominio**. Registrar la ruta en esta suite fue lo que hizo notar que sin esa
 * comprobación cualquiera con cuenta en un club podía abrir sesión en otro.
 */
const CON_TEST_PROPIO = [
  "POST /auth/login",
  // `auth-logout.int-spec` → «no toca las demás sesiones» y «no toca las sesiones de otra
  // persona». El aislamiento de estas dos rutas es por **cuenta**, no por club: cierran lo que es
  // de quien pide y nada más. El recorrido genérico de abajo, que prueba con recursos de otro
  // club, no diría nada sobre eso.
  "POST /auth/logout",
  "POST /auth/logout-all",
  // `me-password.int-spec` → «exige la contraseña actual aunque haya sesión válida» y «las demás
  // sesiones se cierran». Igual que las de arriba: su aislamiento es por **cuenta**, no por club.
  "POST /me/password",
  // `password-reset.int-spec` → «una cuenta de otro club no recibe nada desde este subdominio» y
  // «el enlace apunta al subdominio del club, no al Host de la solicitud». El aislamiento de estas
  // dos es doble: por club al pedir, y por token al usar.
  "POST /auth/password/forgot",
  "POST /auth/password/reset",
  // `me.int-spec` → «NO expone campos administrativos», «no se puede cerrar la sesión de otra
  // persona (404)». Todo `/me` es por definición de quien pide: su aislamiento es por cuenta.
  "GET /me",
  "PATCH /me",
  "POST /me/email-change",
  "POST /me/email-change/confirm",
  "GET /me/sessions",
  "DELETE /me/sessions/:id",
  // `users.int-spec` cubre el aislamiento de todas éstas: «nunca lista usuarios de otro club»,
  // «un usuario de otro club responde 404 por acceso directo» y «un administrador de organización
  // sólo ve a la gente de la suya». El recorrido genérico no sirve aquí porque cada ruta necesita
  // un cuerpo propio y válido para llegar siquiera al servicio.
  "GET /users",
  "GET /users/export",
  "GET /users/:id",
  "POST /users",
  "PATCH /users/:id",
  "POST /users/:id/invite",
  "POST /users/:id/suspend",
  "POST /users/:id/reactivate",
  "POST /users/:id/archive",
  "POST /users/:id/restore",
  "POST /auth/invitation/accept",
  // `users.int-spec` §roles → «un administrador de organización no otorga roles de club» y «el club
  // nunca viaja en el cuerpo». El aislamiento de estas dos es por ámbito del rol, no por recurso.
  "POST /users/:id/roles",
  "DELETE /users/:id/roles/:roleAssignmentId",
  // `family.int-spec` → «una persona de otro club responde 404» y «alguien que no es su acudiente
  // no acepta por el menor». El waiver vigente es por club y la aceptación es por persona.
  "POST /guardianships",
  "GET /guardianships/:dependentPersonId",
  "GET /waivers/current",
  "POST /waivers",
  "POST /waivers/current/accept",
];

/** Rutas que no operan dentro de un club y por lo tanto no tienen tenant que aislar. */
const SIN_TENANT = [
  "GET /health",
  "GET /ready",
  "POST /platform/clubs",
  "POST /platform/clubs/:id/suspend",
  "POST /platform/clubs/:id/reactivate",
  "GET /platform/settings",
  "PUT /platform/settings/:key",
];

/**
 * Cada ruta de club, con lo que se espera cuando la llama alguien de **otro** club.
 *
 * - `ajeno`: la ruta recibe el identificador de un recurso de otro club. Debe responder `404` —
 *   nunca `403`, que confirmaría que ese recurso existe, ni `2xx`, que sería la fuga completa.
 * - `vacio`: es un listado. No debe traer ni un dato del club ajeno.
 * - `propio`: la ruta no recibe identificadores; opera sobre el club del subdominio. Aislarla
 *   significa que su respuesta no puede contener nada del otro club.
 */
const COBERTURA: { ruta: string; espera: "ajeno" | "vacio" | "propio" }[] = [
  { ruta: "GET /clubs/current/public", espera: "propio" },
  { ruta: "GET /clubs/current", espera: "propio" },
  { ruta: "PATCH /clubs/current", espera: "propio" },
  { ruta: "GET /organizations", espera: "vacio" },
  { ruta: "POST /organizations", espera: "propio" },
  { ruta: "PATCH /organizations/:id", espera: "ajeno" },
  { ruta: "POST /organizations/:id/archive", espera: "ajeno" },
  { ruta: "GET /seasons", espera: "vacio" },
  { ruta: "POST /seasons", espera: "propio" },
  { ruta: "POST /seasons/:id/close", espera: "ajeno" },
  { ruta: "GET /membership-categories", espera: "vacio" },
  { ruta: "POST /membership-categories", espera: "propio" },
  { ruta: "PATCH /membership-categories/:id", espera: "ajeno" },
  { ruta: "GET /settings", espera: "propio" },
  { ruta: "GET /settings/:key", espera: "propio" },
  { ruta: "GET /settings/:key/history", espera: "propio" },
  { ruta: "PUT /settings/:key", espera: "propio" },
  { ruta: "GET /organizations/:id/settings", espera: "ajeno" },
  { ruta: "PUT /organizations/:id/settings/:key", espera: "ajeno" },
];

const VERBOS: Record<number, string> = {
  [RequestMethod.GET]: "GET",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.DELETE]: "DELETE",
};

describe("Aislamiento de tenant por ruta (T-261, ADR-014 punto 3)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let rutasRegistradas: string[];
  let clubAjeno: { id: string; slug: string };
  let tokenDelClubAjeno: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DOMAIN)
      .useValue(BASE)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    rutasRegistradas = enumerarRutas(app);

    const slug = etiqueta("aislado").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club aislado" } });
    clubAjeno = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const persona = await prisma.person.create({
      data: { clubId: clubAjeno.id, fullName: "Administrador del club aislado" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${etiqueta("aislado")}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });
    await prisma.roleAssignment.create({
      data: {
        userAccountId: cuenta.id,
        role: "club_admin",
        scope: "club",
        scopeId: clubAjeno.id,
        grantedById: cuenta.id,
      },
    });
    tokenDelClubAjeno = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(tokenDelClubAjeno),
        expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("toda ruta registrada está declarada: sin su caso de aislamiento, esto falla", () => {
    const declaradas = new Set([
      ...SIN_TENANT,
      ...CON_TEST_PROPIO,
      ...COBERTURA.map((caso) => caso.ruta),
    ]);
    const sinDeclarar = rutasRegistradas.filter((ruta) => !declaradas.has(ruta));

    expect(sinDeclarar).toEqual([]);
  });

  it("no sobran declaraciones: una ruta que se borró no puede seguir declarada", () => {
    // El error simétrico. Sin esto, la lista se llena de rutas que ya no existen y deja de decir
    // nada sobre la aplicación real.
    const registradas = new Set(rutasRegistradas);
    const sobrantes = [...SIN_TENANT, ...CON_TEST_PROPIO, ...COBERTURA.map((caso) => caso.ruta)].filter(
      (ruta) => !registradas.has(ruta),
    );

    expect(sobrantes).toEqual([]);
  });

  it("desde el subdominio de un club, nada de otro club es alcanzable", async () => {
    // Se recorre TODA la cobertura declarada en una sola prueba: cada ruta se llama desde el
    // subdominio del club ajeno usando identificadores que pertenecen a otro club.
    const otroSlug = etiqueta("victima").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const victima = await prisma.club.create({ data: { slug: otroSlug, name: "Club víctima" } });
    const organizacionAjena = await prisma.organization.create({
      data: { clubId: victima.id, name: `Ajena ${etiqueta("o")}`, type: "school" },
    });
    const temporadaAjena = await prisma.season.create({
      data: {
        clubId: victima.id,
        name: `Ajena ${etiqueta("t")}`,
        startsOn: new Date("2040-01-01"),
        endsOn: new Date("2040-12-31"),
      },
    });
    const categoriaAjena = await prisma.membershipCategory.create({
      data: { clubId: victima.id, code: "ajena", name: "Ajena", monthlyFeeCents: 0n, rights: {} },
    });
    app.get(ClubDirectory).invalidate();

    const fallos: string[] = [];

    for (const caso of COBERTURA) {
      const [verbo, plantilla] = caso.ruta.split(" ") as [string, string];
      const ruta = plantilla
        .replace("/organizations/:id/settings", `/organizations/${organizacionAjena.id}/settings`)
        .replace("/organizations/:id", `/organizations/${organizacionAjena.id}`)
        .replace("/seasons/:id", `/seasons/${temporadaAjena.id}`)
        .replace("/membership-categories/:id", `/membership-categories/${categoriaAjena.id}`)
        .replace(":key", "identity.minor_profile_max_age");

      const metodo = verbo.toLowerCase() as "get" | "post" | "put" | "patch";
      const agente = request(app.getHttpServer());
      const respuesta = await agente[metodo](ruta)
        // El host es el del club **propio** del actor; los identificadores son del club víctima.
        .set("Host", `${clubAjeno.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenDelClubAjeno}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenDelClubAjeno))
        .send({ value: 17, name: "Intento", type: "team", startsOn: "2040-01-01", endsOn: "2040-06-30", code: "x", monthlyFeeCents: 0 });

      const ajenos = [organizacionAjena.id, temporadaAjena.id, categoriaAjena.id, victima.id];

      if (caso.espera === "propio") {
        // Opera sobre el club del subdominio: lo que no puede es traer nada del otro.
        if (ajenos.some((id) => JSON.stringify(respuesta.body).includes(id))) {
          fallos.push(`${caso.ruta} filtró datos de otro club en su respuesta`);
        }

        continue;
      }

      if (caso.espera === "vacio") {
        const ids = Array.isArray(respuesta.body)
          ? respuesta.body.map((fila: { id?: string }) => fila.id)
          : [];

        if (ids.some((id: string | undefined) => id !== undefined && ajenos.includes(id))) {
          fallos.push(`${caso.ruta} devolvió datos de otro club`);
        }

        continue;
      }

      // `ajeno`: el recurso no debe existir para este club. `404` es lo esperado; un `403` sería
      // una fuga —confirma que existe— y un `2xx` sería la fuga completa.
      if (respuesta.status < 400) {
        fallos.push(`${caso.ruta} respondió ${respuesta.status} sobre un recurso de otro club`);
      }

      if (respuesta.status === 403) {
        fallos.push(`${caso.ruta} respondió 403 sobre un recurso ajeno: debería ser 404 (P-05)`);
      }
    }

    expect(fallos).toEqual([]);
  });
});

/** Las rutas que la aplicación tiene montadas, en formato `VERBO /ruta`. */
function enumerarRutas(app: INestApplication): string[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const rutas: string[] = [];

  for (const wrapper of discovery.getControllers()) {
    const instancia: unknown = wrapper.instance;

    if (instancia === null || typeof instancia !== "object") continue;

    const prototipo: object = Object.getPrototypeOf(instancia);
    const base: unknown = reflector.get(PATH_METADATA, instancia.constructor);
    const prefijo = typeof base === "string" && base !== "/" ? base : "";

    for (const metodo of scanner.getAllMethodNames(prototipo)) {
      const manejador: unknown = (prototipo as Record<string, unknown>)[metodo];

      if (typeof manejador !== "function") continue;

      const verbo = reflector.get<number | undefined>(METHOD_METADATA, manejador);
      const sufijo = reflector.get<string | undefined>(PATH_METADATA, manejador);

      if (verbo === undefined || VERBOS[verbo] === undefined) continue;

      const cola = sufijo === undefined || sufijo === "/" ? "" : `/${sufijo}`;
      rutas.push(`${VERBOS[verbo]} /${[prefijo, cola.slice(1)].filter(Boolean).join("/")}`);
    }
  }

  return rutas;
}
