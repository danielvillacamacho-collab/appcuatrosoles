import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { LoginResponse } from "@polo/contracts";
import { AppModule } from "../../src/app.module.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { CABECERA_CSRF, COOKIE_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import { COOKIE_DE_SESION, hashDeTokenDeSesion } from "../../src/common/auth/session-token.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";
const CONTRASENA = "una-contrasena-de-prueba-8";

describe("Inicio de sesión (T-030, HU-010-04)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let correo: string;

  function entrar(cuerpo: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .post("/auth/login")
      .set("Host", `${club.slug}.${BASE}`)
      .send(cuerpo);
  }

  async function crearCuenta(
    estado: "invited" | "active" | "suspended" | "archived",
  ): Promise<string> {
    const marca = etiqueta("login");
    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: "Jugadora que entra" },
    });
    const hash = await app.get(PasswordService).hash(CONTRASENA);
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: hash,
        status: estado,
      },
    });

    return cuenta.email;
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

    const slug = etiqueta("login").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club con login" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    correo = await crearCuenta("active");
  });

  beforeEach(async () => {
    // Los tests de este archivo comparten una cuenta y varios fallan la contraseña a propósito.
    // Desde T-032 eso la bloquea de verdad —el sistema hace lo que debe— así que se limpia el
    // contador entre pruebas. El bloqueo tiene su propio archivo, con cuentas propias.
    await prisma.userAccount.updateMany({
      where: { email: correo },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("camino feliz", () => {
    it("con credenciales correctas devuelve al usuario y abre una sesión", async () => {
      const respuesta = await entrar({ email: correo, password: CONTRASENA });

      expect(respuesta.status).toBe(200);
      expect(LoginResponse.safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body.email).toBe(correo);
    });

    it("el token de sesión NO viaja en el cuerpo, sólo en la cookie", async () => {
      // Devolverlo también en el cuerpo anularía el `httpOnly`: bastaría un XSS para llevárselo.
      const respuesta = await entrar({ email: correo, password: CONTRASENA });

      expect(JSON.stringify(respuesta.body)).not.toContain("token");
      expect(Object.keys(respuesta.body).sort()).toEqual([
        "email",
        "fullName",
        "personId",
        "userAccountId",
      ]);
    });

    it("la cookie de sesión es httpOnly y sin atributo Domain", async () => {
      // Sin `Domain`, la cookie es de este host y sólo de este host: el subdominio de otro club no
      // la recibe. Es la mitad silenciosa de la defensa CSRF (T-025).
      const respuesta = await entrar({ email: correo, password: CONTRASENA });
      const cookies = respuesta.headers["set-cookie"] as unknown as string[];
      const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`));

      expect(sesion).toBeDefined();
      expect(sesion).toContain("HttpOnly");
      expect(sesion?.toLowerCase()).not.toContain("domain=");
    });

    it("emite además la cookie de CSRF, y ésa sí es legible por JavaScript", async () => {
      // Es lo contrario de la de sesión a propósito: el frontend tiene que leerla para devolverla
      // en la cabecera. No es un secreto que proteger, es una prueba de origen.
      const respuesta = await entrar({ email: correo, password: CONTRASENA });
      const cookies = respuesta.headers["set-cookie"] as unknown as string[];
      const csrf = cookies.find((c) => c.startsWith(`${COOKIE_CSRF}=`));

      expect(csrf).toBeDefined();
      expect(csrf).not.toContain("HttpOnly");
    });

    it("la sesión recién abierta sirve de verdad: con ella se puede operar", async () => {
      const respuesta = await entrar({ email: correo, password: CONTRASENA });
      const cookies = respuesta.headers["set-cookie"] as unknown as string[];
      const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";
      const token = sesion.slice(`${COOKIE_DE_SESION}=`.length).split(";")[0] ?? "";

      const perfil = await request(app.getHttpServer())
        .get("/clubs/current")
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`);

      expect(perfil.status).toBe(200);
    });

    it("la cookie de CSRF que emite sirve para mutar: las dos mitades encajan", async () => {
      // Si el token emitido no coincidiera con el que el middleware espera, el sistema quedaría
      // inusable para un cliente real y ningún test de T-025 lo habría notado.
      const respuesta = await entrar({ email: correo, password: CONTRASENA });
      const cookies = respuesta.headers["set-cookie"] as unknown as string[];
      const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";
      const token = sesion.slice(`${COOKIE_DE_SESION}=`.length).split(";")[0] ?? "";
      const csrf = cookies.find((c) => c.startsWith(`${COOKIE_CSRF}=`)) ?? "";
      const valorCsrf = csrf.slice(`${COOKIE_CSRF}=`.length).split(";")[0] ?? "";

      expect(valorCsrf).toBe(tokenCsrfParaSesion(token));
    });

    it("guarda la sesión con su hash, nunca con el token en claro", async () => {
      const respuesta = await entrar({ email: correo, password: CONTRASENA });
      const cookies = respuesta.headers["set-cookie"] as unknown as string[];
      const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";
      const token = sesion.slice(`${COOKIE_DE_SESION}=`.length).split(";")[0] ?? "";

      expect(await prisma.session.findUnique({ where: { tokenHash: token } })).toBeNull();
      expect(
        await prisma.session.findUnique({ where: { tokenHash: hashDeTokenDeSesion(token) } }),
      ).not.toBeNull();
    });

    it("«recordarme» abre una sesión larga; sin él, una de jornada", async () => {
      const corta = await entrar({ email: correo, password: CONTRASENA });
      const larga = await entrar({ email: correo, password: CONTRASENA, rememberMe: true });

      const vencimiento = (respuesta: request.Response): number => {
        const cookies = respuesta.headers["set-cookie"] as unknown as string[];
        const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";
        const expira = /expires=([^;]+)/i.exec(sesion)?.[1] ?? "";

        return new Date(expira).getTime();
      };

      expect(vencimiento(larga)).toBeGreaterThan(vencimiento(corta));
    });

    it("entrar bien borra el contador de intentos fallidos", async () => {
      // Sin esto, cuatro errores de tipeo repartidos en un mes acabarían bloqueando a alguien que
      // nunca falló dos veces seguidas (el bloqueo en sí es T-032).
      const cuenta = await prisma.userAccount.findUniqueOrThrow({ where: { email: correo } });
      await prisma.userAccount.update({
        where: { id: cuenta.id },
        data: { failedAttempts: 3 },
      });

      await entrar({ email: correo, password: CONTRASENA });

      const despues = await prisma.userAccount.findUniqueOrThrow({ where: { email: correo } });
      expect(despues.failedAttempts).toBe(0);
      expect(despues.lastLoginAt).not.toBeNull();
    });
  });

  describe("el contrato", () => {
    it("rechaza un cuerpo sin correo o sin contraseña, diciendo qué campo", async () => {
      const respuesta = await entrar({ email: "no-es-un-correo" });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.details.fields).toHaveProperty("email");
      expect(respuesta.body.error.details.fields).toHaveProperty("password");
    });

    it("el correo no distingue mayúsculas ni espacios alrededor", async () => {
      const respuesta = await entrar({
        email: `  ${correo.toUpperCase()}  `,
        password: CONTRASENA,
      });

      expect(respuesta.status).toBe(200);
    });
  });

  describe("lo que no deja pasar", () => {
    it("una contraseña incorrecta responde 401", async () => {
      expect((await entrar({ email: correo, password: "otra-cosa" })).status).toBe(401);
    });

    it("un correo inexistente responde 401 — el mismo cuerpo, byte a byte (R-010-07)", async () => {
      // T-031 lo cubre en detalle; aquí se fija desde el principio para que no se rompa antes.
      const inexistente = await entrar({
        email: `${etiqueta("nadie")}@ejemplo.test`,
        password: CONTRASENA,
      });
      const malaContrasena = await entrar({ email: correo, password: "otra-cosa" });

      const sinRequestId = (cuerpo: { error: Record<string, unknown> }): string => {
        const resto: Record<string, unknown> = { ...cuerpo.error };
        delete resto.requestId;

        return JSON.stringify(resto);
      };

      expect(inexistente.status).toBe(401);
      expect(sinRequestId(inexistente.body)).toBe(sinRequestId(malaContrasena.body));
    });

    it("los cuatro rechazos de credenciales son idénticos byte a byte (T-031, R-010-07)", async () => {
      // Cuatro formas de equivocarse que deben ser indistinguibles desde afuera. Si alguna se
      // diferenciara —por el cuerpo, por el estado o por una cabecera— el login pasaría a ser un
      // detector de correos registrados: escribir uno y ver si la respuesta cambia.
      const intentos = [
        { email: `${etiqueta("nadie")}@ejemplo.test`, password: CONTRASENA },
        { email: `${etiqueta("tampoco")}@ejemplo.test`, password: "cualquier-cosa" },
        { email: correo, password: "contrasena-incorrecta" },
        { email: correo, password: "otra-incorrecta-distinta" },
      ];

      const respuestas = [];

      for (const intento of intentos) {
        respuestas.push(await entrar(intento));
      }

      const huella = (respuesta: request.Response): string => {
        const resto: Record<string, unknown> = { ...respuesta.body.error };
        delete resto.requestId;

        return JSON.stringify({ status: respuesta.status, error: resto });
      };

      expect(new Set(respuestas.map(huella)).size).toBe(1);
      expect(respuestas[0]?.body.error.message).toBe(
        "Correo o contraseña incorrectos.",
      );
    });

    it("ninguna cabecera delata la diferencia entre correo inexistente y contraseña mala", async () => {
      const inexistente = await entrar({
        email: `${etiqueta("fantasma")}@ejemplo.test`,
        password: CONTRASENA,
      });
      const malaContrasena = await entrar({ email: correo, password: "no-es" });

      const cabeceras = (respuesta: request.Response): string[] =>
        Object.keys(respuesta.headers)
          .filter((nombre) => nombre !== "x-request-id" && nombre !== "date" && nombre !== "etag")
          .sort();

      expect(cabeceras(inexistente)).toEqual(cabeceras(malaContrasena));
      expect(inexistente.headers["set-cookie"]).toBeUndefined();
    });

    it("una cuenta invitada no entra, y se le dice qué hacer (T-033)", async () => {
      const invitada = await crearCuenta("invited");

      const respuesta = await entrar({ email: invitada, password: CONTRASENA });

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error.code).toBe("INVITATION_PENDING");
      expect(respuesta.body.error.message).toContain("invitación");
    });

    it("una suspendida y una archivada reciben cada una su motivo (T-033)", async () => {
      const suspendida = await crearCuenta("suspended");
      const archivada = await crearCuenta("archived");

      expect((await entrar({ email: suspendida, password: CONTRASENA })).body.error.code).toBe(
        "ACCOUNT_SUSPENDED",
      );
      expect((await entrar({ email: archivada, password: CONTRASENA })).body.error.code).toBe(
        "ACCOUNT_ARCHIVED",
      );
    });

    it("pero el motivo SÓLO llega a quien acertó la contraseña (T-033 + P-12)", async () => {
      // Es la regla que hace compatibles el PRD —«un mensaje acorde al estado»— con la prohibición
      // de revelar la existencia de una cuenta. Con la contraseña equivocada, una cuenta suspendida
      // responde exactamente lo mismo que un correo que no existe.
      const suspendida = await crearCuenta("suspended");

      const conContrasenaMala = await entrar({ email: suspendida, password: "no-es-esa" });
      const inexistente = await entrar({
        email: `${etiqueta("nadie")}@ejemplo.test`,
        password: "no-es-esa",
      });

      expect(conContrasenaMala.body.error.code).toBe("CREDENTIALS_INVALID");
      expect(conContrasenaMala.body.error.message).toBe(inexistente.body.error.message);
    });

    it("un intento fallido no abre ninguna sesión", async () => {
      const antes = await prisma.session.count();

      await entrar({ email: correo, password: "otra-cosa" });

      expect(await prisma.session.count()).toBe(antes);
    });

    it("desde un subdominio desconocido ni siquiera se intenta: 404", async () => {
      // `TenantGuard` corre antes. Sin eso, probar correos desde un subdominio inventado sería una
      // forma de averiguar quién tiene cuenta en la plataforma.
      const respuesta = await request(app.getHttpServer())
        .post("/auth/login")
        .set("Host", `inventado.${BASE}`)
        .send({ email: correo, password: CONTRASENA });

      expect(respuesta.status).toBe(404);
    });

    it("una cuenta de OTRO club no entra por este subdominio (P-05)", async () => {
      // Lo encontró la prueba de aislamiento al registrar esta ruta. Sin esta comprobación,
      // cualquiera con cuenta en un club podía entrar por el subdominio de otro: no obtendría
      // permisos —sus roles son de su club— pero las rutas que sólo exigen sesión (el detalle del
      // club, los listados de organizaciones, temporadas y categorías) le habrían quedado
      // abiertas. Un club leyendo la estructura de otro con sólo tener cuenta propia.
      const otroSlug = etiqueta("otro-club").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
      const otroClub = await prisma.club.create({ data: { slug: otroSlug, name: "Otro club" } });
      app.get(ClubDirectory).invalidate();

      const respuesta = await request(app.getHttpServer())
        .post("/auth/login")
        .set("Host", `${otroClub.slug}.${BASE}`)
        .send({ email: correo, password: CONTRASENA });

      expect(respuesta.status).toBe(401);
      // El mismo cuerpo que una contraseña incorrecta: decir «tu cuenta no es de este club»
      // confirmaría que existe (P-12).
      const malaContrasena = await entrar({ email: correo, password: "otra-cosa" });
      expect(respuesta.body.error.code).toBe(malaContrasena.body.error.code);
    });

    it("pero nuestro personal de servicio sí, si tiene un rol en ese club (specs/140 HU-140-03)", async () => {
      const otroSlug = etiqueta("cliente").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
      const otroClub = await prisma.club.create({ data: { slug: otroSlug, name: "Club cliente" } });
      app.get(ClubDirectory).invalidate();

      const cuenta = await prisma.userAccount.findUniqueOrThrow({ where: { email: correo } });
      await prisma.roleAssignment.create({
        data: {
          userAccountId: cuenta.id,
          role: "commissioner",
          scope: "club",
          scopeId: otroClub.id,
          grantedById: cuenta.id,
        },
      });

      const respuesta = await request(app.getHttpServer())
        .post("/auth/login")
        .set("Host", `${otroClub.slug}.${BASE}`)
        .send({ email: correo, password: CONTRASENA });

      expect(respuesta.status).toBe(200);
    });

    it("no exige token de CSRF: nadie tiene sesión todavía cuando inicia sesión", async () => {
      const respuesta = await entrar({ email: correo, password: CONTRASENA });

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers[CABECERA_CSRF]).toBeUndefined();
    });
  });
});
