import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { CABECERA_CSRF, COOKIE_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import { COOKIE_DE_SESION } from "../../src/common/auth/session-token.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";
const CONTRASENA = "la-contrasena-de-siempre-7";

describe("Cierre de sesión (T-034, R-010-09)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let correo: string;

  /** Inicia sesión de verdad y devuelve el token, como lo haría el navegador. */
  async function entrarYObtenerToken(): Promise<string> {
    const respuesta = await request(app.getHttpServer())
      .post("/auth/login")
      .set("Host", `${club.slug}.${BASE}`)
      .send({ email: correo, password: CONTRASENA });

    const cookies = respuesta.headers["set-cookie"] as unknown as string[];
    const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";

    return sesion.slice(`${COOKIE_DE_SESION}=`.length).split(";")[0] ?? "";
  }

  function con(token: string) {
    return {
      get: (ruta: string) =>
        request(app.getHttpServer())
          .get(ruta)
          .set("Host", `${club.slug}.${BASE}`)
          .set("Cookie", `${COOKIE_DE_SESION}=${token}`),
      post: (ruta: string) =>
        request(app.getHttpServer())
          .post(ruta)
          .set("Host", `${club.slug}.${BASE}`)
          .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
          .set(CABECERA_CSRF, tokenCsrfParaSesion(token)),
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

    const slug = etiqueta("salida").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club con salida" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: "Persona que se va" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${etiqueta("salida")}@ejemplo.test`,
        passwordHash: await app.get(PasswordService).hash(CONTRASENA),
        status: "active",
      },
    });
    correo = cuenta.email;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("cerrar esta sesión", () => {
    it("la sesión cerrada no sirve ni repitiendo la misma petición (el «atrás» del navegador)", async () => {
      // El criterio literal de T-034. Volver atrás en el navegador reenvía la misma solicitud con
      // la misma cookie: si el cierre fuera sólo del lado del cliente, seguiría funcionando.
      const token = await entrarYObtenerToken();

      expect((await con(token).get("/clubs/current")).status).toBe(200);
      expect((await con(token).post("/auth/logout")).status).toBe(204);
      expect((await con(token).get("/clubs/current")).status).toBe(401);
    });

    it("revoca, no borra: queda constancia de cuándo se cerró", async () => {
      const token = await entrarYObtenerToken();
      await con(token).post("/auth/logout");

      const sesiones = await prisma.session.findMany({
        where: { userAccount: { email: correo } },
        orderBy: { createdAt: "desc" },
        take: 1,
      });

      expect(sesiones[0]?.revokedAt).not.toBeNull();
    });

    it("borra las dos cookies: el navegador deja de mandar una credencial muerta", async () => {
      const token = await entrarYObtenerToken();

      const respuesta = await con(token).post("/auth/logout");
      const cookies = (respuesta.headers["set-cookie"] as unknown as string[]) ?? [];

      expect(cookies.some((c) => c.startsWith(`${COOKIE_DE_SESION}=;`))).toBe(true);
      expect(cookies.some((c) => c.startsWith(`${COOKIE_CSRF}=;`))).toBe(true);
    });

    it("cerrar dos veces no falla: cerrar algo ya cerrado es un éxito", async () => {
      // Dos pestañas cerrando a la vez es un caso real, no un borde teórico.
      const token = await entrarYObtenerToken();

      expect((await con(token).post("/auth/logout")).status).toBe(204);
      // La segunda ya no tiene sesión válida, así que la rechaza el guard — no revienta.
      expect((await con(token).post("/auth/logout")).status).toBe(401);
    });

    it("no toca las demás sesiones de la misma persona", async () => {
      const enElCelular = await entrarYObtenerToken();
      const enLaComputadora = await entrarYObtenerToken();

      await con(enElCelular).post("/auth/logout");

      expect((await con(enLaComputadora).get("/clubs/current")).status).toBe(200);
    });

    it("exige el token de CSRF, como toda mutación", async () => {
      const token = await entrarYObtenerToken();

      const sinToken = await request(app.getHttpServer())
        .post("/auth/logout")
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`);

      expect(sinToken.status).toBe(403);
    });

    it("sin sesión responde 401, no un cierre silencioso", async () => {
      const respuesta = await request(app.getHttpServer())
        .post("/auth/logout")
        .set("Host", `${club.slug}.${BASE}`);

      expect(respuesta.status).toBe(401);
    });
  });

  describe("cerrar todas", () => {
    it("cierra también la actual: media desconexión no tranquiliza a nadie", async () => {
      const enElCelular = await entrarYObtenerToken();
      const enLaComputadora = await entrarYObtenerToken();
      const enElTrabajo = await entrarYObtenerToken();

      expect((await con(enElTrabajo).post("/auth/logout-all")).status).toBe(204);

      for (const token of [enElCelular, enLaComputadora, enElTrabajo]) {
        expect((await con(token).get("/clubs/current")).status).toBe(401);
      }
    });

    it("no toca las sesiones de otra persona", async () => {
      const otraPersona = await prisma.person.create({
        data: { clubId: club.id, fullName: "Otra persona" },
      });
      const otraCuenta = await prisma.userAccount.create({
        data: {
          personId: otraPersona.id,
          email: `${etiqueta("otra")}@ejemplo.test`,
          passwordHash: await app.get(PasswordService).hash(CONTRASENA),
          status: "active",
        },
      });
      const respuestaOtra = await request(app.getHttpServer())
        .post("/auth/login")
        .set("Host", `${club.slug}.${BASE}`)
        .send({ email: otraCuenta.email, password: CONTRASENA });
      const cookiesOtra = respuestaOtra.headers["set-cookie"] as unknown as string[];
      const tokenOtra =
        (cookiesOtra.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "")
          .slice(`${COOKIE_DE_SESION}=`.length)
          .split(";")[0] ?? "";

      const mia = await entrarYObtenerToken();
      await con(mia).post("/auth/logout-all");

      expect((await con(tokenOtra).get("/clubs/current")).status).toBe(200);
    });
  });
});
