import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { NotificationPreferenceResponse } from "@polo/contracts";
import { NOTIFICATION_TYPES } from "@polo/domain";
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
const CONTRASENA = "mis-avisos-del-club-9";

describe("Preferencias de aviso (T-091)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let correo: string;
  let cuentaId: string;

  async function entrar(): Promise<string> {
    const respuesta = await request(app.getHttpServer())
      .post("/auth/login")
      .set("Host", `${club.slug}.${BASE}`)
      .send({ email: correo, password: CONTRASENA });
    const cookies = (respuesta.headers["set-cookie"] as unknown as string[]) ?? [];
    const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";

    return sesion.slice(`${COOKIE_DE_SESION}=`.length).split(";")[0] ?? "";
  }

  function con(token: string) {
    const base = (metodo: "get" | "patch", ruta: string) => {
      const agente = request(app.getHttpServer());

      return agente[metodo](ruta)
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token));
    };

    return {
      get: (ruta: string) => base("get", ruta),
      patch: (ruta: string) => base("patch", ruta),
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

    const slug = etiqueta("avisos").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club de los avisos" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: "Persona con avisos" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${etiqueta("avisos")}@ejemplo.test`,
        passwordHash: await app.get(PasswordService).hash(CONTRASENA),
        status: "active",
      },
    });
    correo = cuenta.email;
    cuentaId = cuenta.id;
  });

  beforeEach(async () => {
    await prisma.notificationPreference.deleteMany({ where: { userAccountId: cuentaId } });
  });

  afterAll(async () => {
    await app.close();
  });

  it("devuelve el catálogo completo, no las filas guardadas", async () => {
    // Sin fila se recibe el aviso: una pantalla alimentada sólo con filas mostraría la lista vacía
    // la primera vez, que es justo cuando la persona entra a apagar algo.
    const respuesta = await con(await entrar()).get("/me/notification-preferences");

    expect(respuesta.status).toBe(200);
    expect(NotificationPreferenceResponse.array().safeParse(respuesta.body).success).toBe(true);
    expect(respuesta.body.map((fila: { type: string }) => fila.type)).toEqual(
      [...NOTIFICATION_TYPES].sort(),
    );
    expect(respuesta.body.every((fila: { enabled: boolean }) => fila.enabled)).toBe(true);
  });

  it("marca como no apagables los avisos de seguridad y los que son el mecanismo", async () => {
    const respuesta = await con(await entrar()).get("/me/notification-preferences");

    expect(respuesta.body.filter((fila: { canDisable: boolean }) => fila.canDisable)).toEqual([]);
  });

  it("un intento de apagar un aviso inevitable no lo apaga, y no falla", async () => {
    // Devolver `400` obligaría a la interfaz a saber cuál es cuál para no romperse, y la respuesta
    // ya trae `canDisable` diciéndoselo. Lo que no se puede apagar simplemente no se apaga.
    const respuesta = await con(await entrar())
      .patch("/me/notification-preferences")
      .send({ preferences: [{ type: "identity.notify-password-changed", enabled: false }] });

    expect(respuesta.status).toBe(200);
    expect(
      respuesta.body.find((fila: { type: string }) => fila.type === "identity.notify-password-changed")
        .enabled,
    ).toBe(true);
    expect(await prisma.notificationPreference.count({ where: { userAccountId: cuentaId } })).toBe(0);
  });

  it("acepta un aviso de otro módulo sin que identidad tenga que conocerlo", async () => {
    // `NOTIFICATION_TYPES` describe los avisos de ESTE módulo. Exigir que prácticas o copas editen
    // una constante de identidad antes de que sus avisos se puedan silenciar es acoplamiento que
    // no compra nada: una fila para un aviso que nadie manda todavía es inerte.
    const respuesta = await con(await entrar())
      .patch("/me/notification-preferences")
      .send({ preferences: [{ type: "practice.reminder", enabled: false }] });

    expect(respuesta.status).toBe(200);
    expect(
      respuesta.body.find((fila: { type: string }) => fila.type === "practice.reminder"),
    ).toEqual({ type: "practice.reminder", enabled: false, canDisable: true });
  });

  it("lo apagado se sigue viendo después: si no, volvería a aparecer encendido sin estarlo", async () => {
    const token = await entrar();

    await con(token)
      .patch("/me/notification-preferences")
      .send({ preferences: [{ type: "practice.reminder", enabled: false }] });
    const despues = await con(token).get("/me/notification-preferences");

    expect(
      despues.body.find((fila: { type: string }) => fila.type === "practice.reminder").enabled,
    ).toBe(false);
  });

  it("rechaza un cuerpo sin preferencias: pedir un cambio vacío es un error de quien llama", async () => {
    const respuesta = await con(await entrar())
      .patch("/me/notification-preferences")
      .send({ preferences: [] });

    expect(respuesta.status).toBe(400);
  });

  it("rechaza un tipo mal formado: es lo único que impide que la tabla se llene de basura", async () => {
    const respuesta = await con(await entrar())
      .patch("/me/notification-preferences")
      .send({ preferences: [{ type: "SIN PUNTO NI FORMATO", enabled: false }] });

    expect(respuesta.status).toBe(400);
  });

  it("mover el mismo interruptor dos veces no duplica la fila ni falla", async () => {
    // Es lo que hace el `upsert`: sin él, el segundo cambio choca contra la clave única y la
    // pantalla de preferencias devuelve un 500 por apagar algo que ya estaba apagado.
    const token = await entrar();
    const apagar = () =>
      con(token)
        .patch("/me/notification-preferences")
        .send({ preferences: [{ type: "practice.reminder", enabled: false }] });

    await apagar();
    const segunda = await apagar();

    expect(segunda.status).toBe(200);
    expect(
      await prisma.notificationPreference.count({
        where: { userAccountId: cuentaId, type: "practice.reminder" },
      }),
    ).toBe(1);
  });

  it("sin sesión no se ven ni se cambian las preferencias de nadie", async () => {
    const sinCookie = request(app.getHttpServer())
      .get("/me/notification-preferences")
      .set("Host", `${club.slug}.${BASE}`);

    expect((await sinCookie).status).toBe(401);
  });
});
