import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { CABECERA_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import { COOKIE_DE_SESION } from "../../src/common/auth/session-token.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";
const CONTRASENA = "la-de-siempre-2026";

describe("Cambio de la propia contraseña (T-037, T-038)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let correo: string;

  async function entrar(password = CONTRASENA): Promise<string> {
    const respuesta = await request(app.getHttpServer())
      .post("/auth/login")
      .set("Host", `${club.slug}.${BASE}`)
      .send({ email: correo, password });

    const cookies = (respuesta.headers["set-cookie"] as unknown as string[]) ?? [];
    const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";

    return sesion.slice(`${COOKIE_DE_SESION}=`.length).split(";")[0] ?? "";
  }

  function cambiar(token: string, cuerpo: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .post("/me/password")
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
      .set(CABECERA_CSRF, tokenCsrfParaSesion(token))
      .send(cuerpo);
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

    const slug = etiqueta("clave").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club con claves" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: "Persona que cambia su clave" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${etiqueta("clave")}@ejemplo.test`,
        passwordHash: await app.get(PasswordService).hash(CONTRASENA),
        status: "active",
      },
    });
    correo = cuenta.email;
  });

  beforeEach(async () => {
    // Cada test parte de la misma contraseña conocida: varios la cambian a propósito.
    await prisma.userAccount.updateMany({
      where: { email: correo },
      data: {
        passwordHash: await app.get(PasswordService).hash(CONTRASENA),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("cambia la contraseña y la nueva sirve para entrar", async () => {
    const token = await entrar();

    const respuesta = await cambiar(token, {
      currentPassword: CONTRASENA,
      newPassword: "una-nueva-del-2027",
      newPasswordConfirmation: "una-nueva-del-2027",
    });

    expect(respuesta.status).toBe(204);
    expect(await entrar("una-nueva-del-2027")).not.toBe("");
  });

  it("la contraseña vieja deja de servir", async () => {
    const token = await entrar();
    await cambiar(token, {
      currentPassword: CONTRASENA,
      newPassword: "otra-distinta-2027",
      newPasswordConfirmation: "otra-distinta-2027",
    });

    const conLaVieja = await request(app.getHttpServer())
      .post("/auth/login")
      .set("Host", `${club.slug}.${BASE}`)
      .send({ email: correo, password: CONTRASENA });

    expect(conLaVieja.status).toBe(401);
  });

  it("exige la contraseña actual aunque haya sesión válida", async () => {
    // Una sesión abierta en un dispositivo prestado no debería alcanzar para quedarse con la
    // cuenta: cambiar la contraseña es lo que deja a su dueño afuera.
    const token = await entrar();

    const respuesta = await cambiar(token, {
      currentPassword: "no-es-la-actual",
      newPassword: "intento-de-secuestro-1",
      newPasswordConfirmation: "intento-de-secuestro-1",
    });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe("CREDENTIALS_INVALID");
  });

  it("exige que las dos contraseñas nuevas coincidan, y dice cuál falló", async () => {
    const token = await entrar();

    const respuesta = await cambiar(token, {
      currentPassword: CONTRASENA,
      newPassword: "una-nueva-del-2027",
      newPasswordConfirmation: "una-nueva-del-2028",
    });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.details.fields).toHaveProperty("newPasswordConfirmation");
  });

  describe("la política de contraseñas (T-038), vista desde la API", () => {
    const rechazos: { nueva: string; porque: string }[] = [
      { nueva: "corta1", porque: "menos de ocho" },
      { nueva: "solo-letras", porque: "sin números" },
      { nueva: "12345678", porque: "sin letras" },
      { nueva: "password1", porque: "de las más usadas" },
    ];

    for (const caso of rechazos) {
      it(`rechaza «${caso.nueva}» — ${caso.porque}`, async () => {
        const token = await entrar();

        const respuesta = await cambiar(token, {
          currentPassword: CONTRASENA,
          newPassword: caso.nueva,
          newPasswordConfirmation: caso.nueva,
        });

        expect(respuesta.status).toBe(422);
        expect(respuesta.body.error.code).toBe("PASSWORD_POLICY");
      });
    }

    it("rechaza una contraseña que contiene el correo, y lo dice", async () => {
      const token = await entrar();
      const parteLocal = correo.split("@")[0] ?? "";

      const respuesta = await cambiar(token, {
        currentPassword: CONTRASENA,
        newPassword: `${parteLocal}2026`,
        newPasswordConfirmation: `${parteLocal}2026`,
      });

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.message).toContain("correo");
    });

    it("cada rechazo dice qué hacer, no sólo que algo está mal", async () => {
      const token = await entrar();

      const respuesta = await cambiar(token, {
        currentPassword: CONTRASENA,
        newPassword: "solo-letras",
        newPasswordConfirmation: "solo-letras",
      });

      expect(respuesta.body.error.message).toContain("número");
    });
  });

  describe("las demás sesiones", () => {
    it("se cierran al cambiar la contraseña, y la actual sobrevive", async () => {
      // Quien cambia su contraseña suele hacerlo porque sospecha de alguien: dejar vivas las otras
      // sesiones convierte el gesto en un trámite. La actual sigue, porque obligar a volver a
      // entrar justo después no protege de nada — es la sesión de quien acaba de demostrar que
      // sabe la contraseña.
      const enElCelular = await entrar();
      const enLaComputadora = await entrar();

      await cambiar(enLaComputadora, {
        currentPassword: CONTRASENA,
        newPassword: "recien-cambiada-99",
        newPasswordConfirmation: "recien-cambiada-99",
      });

      const conLaVieja = await request(app.getHttpServer())
        .get("/clubs/current")
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${enElCelular}`);
      const conLaActual = await request(app.getHttpServer())
        .get("/clubs/current")
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${enLaComputadora}`);

      expect(conLaVieja.status).toBe(401);
      expect(conLaActual.status).toBe(200);
    });
  });

  it("sin sesión no se puede cambiar nada", async () => {
    const respuesta = await request(app.getHttpServer())
      .post("/me/password")
      .set("Host", `${club.slug}.${BASE}`)
      .send({
        currentPassword: CONTRASENA,
        newPassword: "da-igual-2026",
        newPasswordConfirmation: "da-igual-2026",
      });

    expect(respuesta.status).toBe(401);
  });
});
