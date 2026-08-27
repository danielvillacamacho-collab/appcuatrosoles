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
  "POST /api/auth/login",
  // `auth-logout.int-spec` → «no toca las demás sesiones» y «no toca las sesiones de otra
  // persona». El aislamiento de estas dos rutas es por **cuenta**, no por club: cierran lo que es
  // de quien pide y nada más. El recorrido genérico de abajo, que prueba con recursos de otro
  // club, no diría nada sobre eso.
  "POST /api/auth/logout",
  "POST /api/auth/logout-all",
  // `me-password.int-spec` → «exige la contraseña actual aunque haya sesión válida» y «las demás
  // sesiones se cierran». Igual que las de arriba: su aislamiento es por **cuenta**, no por club.
  "POST /api/me/password",
  // `password-reset.int-spec` → «una cuenta de otro club no recibe nada desde este subdominio» y
  // «el enlace apunta al subdominio del club, no al Host de la solicitud». El aislamiento de estas
  // dos es doble: por club al pedir, y por token al usar.
  "POST /api/auth/password/forgot",
  "POST /api/auth/password/reset",
  // `me.int-spec` → «NO expone campos administrativos», «no se puede cerrar la sesión de otra
  // persona (404)». Todo `/api/me` es por definición de quien pide: su aislamiento es por cuenta.
  "GET /api/me",
  "PATCH /api/me",
  "POST /api/me/email-change",
  "POST /api/me/email-change/confirm",
  "GET /api/me/sessions",
  "DELETE /api/me/sessions/:id",
  // `me-notifications.int-spec` → «sin sesión no se ven ni se cambian las preferencias de nadie».
  // Las preferencias cuelgan de la cuenta, no del club: la misma persona en dos clubes elige una
  // sola vez si quiere que le recuerden las prácticas.
  "GET /api/me/notification-preferences",
  "PATCH /api/me/notification-preferences",
  // `minors.int-spec` → «no muestra a los hijos de otro: el recorte lo hace el vínculo, no el rol»
  // y «un vínculo terminado deja de mostrarse». Aquí el aislamiento no es sólo por club: dos
  // acudientes del MISMO club no pueden verse los hijos.
  "GET /api/me/dependents",
  // `fields.int-spec` → «una cancha de otro club responde 404, nunca 403 (P-05)» y «bloquear encima
  // de algo existente se rechaza». El recorrido genérico no sirve para el bloqueo: necesita un
  // cuerpo con fechas coherentes dentro del horario del club para llegar siquiera al servicio.
  // `calendar.int-spec` → «el calendario de otro club no se alcanza desde este subdominio» y «LA
  // RESPUESTA ENTERA no contiene ningún identificador de lo ajeno y privado». El recorrido genérico
  // no sirve: esta ruta no recibe identificadores, recibe una fecha — su aislamiento es por lo que
  // devuelve, no por lo que se le pide.
  "GET /api/calendar",
  // `handicaps.int-spec` → «una persona de otro club responde 404, nunca 403 (P-05)», «LA RESPUESTA
  // ENTERA no filtra nada de un historial ajeno» y «no incluye personas de otro club».
  //
  // Las tres van con test propio por motivos distintos. El `PUT` necesita cuerpo válido **y** un
  // actor con `handicap.edit` —que el recorrido genérico no tiene, porque el comisario es el único
  // que lo tiene y no es un rol administrativo—. El historial se acota además **por persona**: dos
  // jugadores del mismo club tampoco se ven el de otro, que el recorrido genérico no probaría. Y el
  // listado del club no recibe identificadores, así que su aislamiento es por lo que devuelve.
  "GET /api/people/:id/handicaps",
  "GET /api/people/:id/handicaps/history",
  "PUT /api/people/:id/handicaps/:type",
  "GET /api/handicaps",
  // `practices.int-spec` → «una práctica de otro club responde 404 (P-05)», «un borrador NO aparece
  // en el listado de nadie» y «no ve en el listado las prácticas de nivel superior».
  //
  // Las ocho van con test propio. El recorrido genérico no sirve para ninguna: crear y editar
  // necesitan un cuerpo con fechas coherentes **y dentro del horario del club**; publicar y cancelar
  // dependen del estado; postularse y retirarse se acotan además **por persona** —el aislamiento no
  // es sólo por club, sino por quién es cada quien— y el listado no recibe identificadores, así que
  // su aislamiento es por lo que devuelve.
  "GET /api/practices",
  "GET /api/practices/:id",
  "POST /api/practices",
  "PATCH /api/practices/:id",
  "POST /api/practices/:id/publish",
  "POST /api/practices/:id/cancel",
  "POST /api/practices/:id/applications",
  "DELETE /api/practices/:id/applications/mine",
  "POST /api/practices/:id/applications/mine/accept-partner",
  // `teams.int-spec` → «una práctica de otro club responde 404» y «un jugador NO ve una propuesta
  // sin aprobar, y la respuesta no filtra ningún nombre».
  //
  // Las cuatro con test propio. Las tres que escriben dependen del estado —sólo se arman equipos de
  // una práctica confirmada—, y la de lectura se acota además **por si quien mira puede aprobar**:
  // su aislamiento no es sólo por club, es por quién es cada quien.
  "GET /api/practices/:id/teams",
  "POST /api/practices/:id/teams/propose",
  "PATCH /api/practices/:id/teams",
  "POST /api/practices/:id/teams/approve",
  // `grid.int-spec` → «el comisario de OTRO club recibe 404, nunca 403» y «tampoco puede corregir
  // la grilla ajena».
  //
  // **Se intentó meterlas en el recorrido genérico y pasaban en vacío**: el recorrido no crea una
  // práctica del club víctima ni sustituye `:id` para prácticas, así que la URL llegaba con `:id`
  // literal y el 404 salía por inexistente, no por aislamiento. Un test que da verde sin probar
  // nada es peor que no tenerlo.
  "GET /api/practices/:id/grid",
  "PATCH /api/practices/:id/grid",
  "POST /api/practices/:id/grid/no-show",
  "POST /api/field-bookings/block",
  "DELETE /api/field-bookings/:id",
  // `minors.int-spec` → «un acudiente de otro club no existe desde aquí: 404, nunca 403». El
  // recorrido genérico no sirve: la ruta necesita un cuerpo válido con una fecha de nacimiento
  // coherente para llegar siquiera al servicio.
  "POST /api/minors",
  // `users.int-spec` cubre el aislamiento de todas éstas: «nunca lista usuarios de otro club»,
  // «un usuario de otro club responde 404 por acceso directo» y «un administrador de organización
  // sólo ve a la gente de la suya». El recorrido genérico no sirve aquí porque cada ruta necesita
  // un cuerpo propio y válido para llegar siquiera al servicio.
  "GET /api/users",
  "GET /api/users/export",
  "GET /api/users/:id",
  "POST /api/users",
  "PATCH /api/users/:id",
  "POST /api/users/:id/invite",
  "POST /api/users/:id/suspend",
  "POST /api/users/:id/reactivate",
  "POST /api/users/:id/archive",
  "POST /api/users/:id/restore",
  "POST /api/auth/invitation/accept",
  // `users.int-spec` §roles → «un administrador de organización no otorga roles de club» y «el club
  // nunca viaja en el cuerpo». El aislamiento de estas dos es por ámbito del rol, no por recurso.
  "POST /api/users/:id/roles",
  "DELETE /api/users/:id/roles/:roleAssignmentId",
  // `family.int-spec` → «una persona de otro club responde 404» y «alguien que no es su acudiente
  // no acepta por el menor». El waiver vigente es por club y la aceptación es por persona.
  "POST /api/guardianships",
  "GET /api/guardianships/:dependentPersonId",
  "GET /api/waivers/current",
  "POST /api/waivers",
  "POST /api/waivers/current/accept",
  // `audit-log.int-spec` → «nunca muestra auditoría de otro club» y «un administrador de
  // organización sólo ve lo de su gente».
  "GET /api/audit-log",
];

/** Rutas que no operan dentro de un club y por lo tanto no tienen tenant que aislar. */
const SIN_TENANT = [
  "GET /api/health",
  "GET /api/ready",
  "POST /api/platform/clubs",
  "POST /api/platform/clubs/:id/suspend",
  "POST /api/platform/clubs/:id/reactivate",
  "GET /api/platform/settings",
  "PUT /api/platform/settings/:key",
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
  { ruta: "GET /api/clubs/current/public", espera: "propio" },
  { ruta: "GET /api/clubs/current", espera: "propio" },
  { ruta: "PATCH /api/clubs/current", espera: "propio" },
  { ruta: "GET /api/organizations", espera: "vacio" },
  { ruta: "POST /api/organizations", espera: "propio" },
  { ruta: "PATCH /api/organizations/:id", espera: "ajeno" },
  { ruta: "POST /api/organizations/:id/archive", espera: "ajeno" },
  { ruta: "GET /api/seasons", espera: "vacio" },
  { ruta: "POST /api/seasons", espera: "propio" },
  { ruta: "POST /api/seasons/:id/close", espera: "ajeno" },
  { ruta: "GET /api/membership-categories", espera: "vacio" },
  { ruta: "POST /api/membership-categories", espera: "propio" },
  { ruta: "PATCH /api/membership-categories/:id", espera: "ajeno" },
  { ruta: "GET /api/fields", espera: "vacio" },
  { ruta: "POST /api/fields", espera: "propio" },
  { ruta: "PATCH /api/fields/:id", espera: "ajeno" },
  { ruta: "POST /api/fields/:id/archive", espera: "ajeno" },
  { ruta: "GET /api/settings", espera: "propio" },
  { ruta: "GET /api/settings/:key", espera: "propio" },
  { ruta: "GET /api/settings/:key/history", espera: "propio" },
  { ruta: "PUT /api/settings/:key", espera: "propio" },
  { ruta: "GET /api/organizations/:id/settings", espera: "ajeno" },
  { ruta: "PUT /api/organizations/:id/settings/:key", espera: "ajeno" },
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
    const canchaAjena = await prisma.field.create({
      data: { clubId: victima.id, name: `Ajena ${etiqueta("f")}` },
    });
    app.get(ClubDirectory).invalidate();

    const fallos: string[] = [];

    for (const caso of COBERTURA) {
      const [verbo, plantilla] = caso.ruta.split(" ") as [string, string];
      const ruta = plantilla
        .replace("/api/organizations/:id/settings", `/api/organizations/${organizacionAjena.id}/settings`)
        .replace("/api/organizations/:id", `/api/organizations/${organizacionAjena.id}`)
        .replace("/api/seasons/:id", `/api/seasons/${temporadaAjena.id}`)
        .replace("/api/membership-categories/:id", `/api/membership-categories/${categoriaAjena.id}`)
        .replace("/api/fields/:id", `/api/fields/${canchaAjena.id}`)
        .replace(":key", "identity.minor_profile_max_age");

      const metodo = verbo.toLowerCase() as "get" | "post" | "put" | "patch";
      const agente = request(app.getHttpServer());
      const respuesta = await agente[metodo](ruta)
        // El host es el del club **propio** del actor; los identificadores son del club víctima.
        .set("Host", `${clubAjeno.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${tokenDelClubAjeno}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(tokenDelClubAjeno))
        .send({ value: 17, name: "Intento", type: "team", startsOn: "2040-01-01", endsOn: "2040-06-30", code: "x", monthlyFeeCents: 0 });

      const ajenos = [organizacionAjena.id, temporadaAjena.id, categoriaAjena.id, canchaAjena.id, victima.id];

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
/**
 * Las rutas tal como se piden desde afuera, **con el prefijo global**.
 *
 * La metadata de los controladores no lo incluye —`setGlobalPrefix` es del adaptador HTTP, no del
 * decorador— así que hay que agregarlo aquí. Si no, este arné compararía `/users` contra una
 * declaración de `/api/users` y pediría rutas que el servidor no sirve: un aviso de aislamiento
 * que en realidad estaría probando un 404.
 */
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
      rutas.push(`${VERBOS[verbo]} /${["api", prefijo, cola.slice(1)].filter(Boolean).join("/")}`);
    }
  }

  return rutas;
}
