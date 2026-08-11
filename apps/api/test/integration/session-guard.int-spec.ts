import "reflect-metadata";
import { Controller, Get, Module, UseGuards, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Clock } from "@polo/domain";
import { CLOCK, ClockModule } from "../../src/common/clock/clock.module.js";
import { CurrentUser, type SessionUser } from "../../src/common/auth/current-user.js";
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

@Controller("protegido")
@UseGuards(SessionGuard)
class ControladorProtegido {
  @Get()
  quienSoy(@CurrentUser() usuario: SessionUser | undefined): SessionUser | undefined {
    return usuario;
  }
}

@Module({ imports: [PrismaModule, ClockModule], controllers: [ControladorProtegido] })
class ModuloProtegido {}

const HORA = 60 * 60 * 1000;

describe("SessionGuard (T-021, docs/06 §1)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /** Crea persona + cuenta + sesión, y devuelve el token en claro que iría en la cookie. */
  async function crearSesion(
    opciones: {
      estado?: "invited" | "active" | "suspended" | "archived";
      venceEn?: number;
      revocada?: boolean;
    } = {},
  ): Promise<{ token: string; userAccountId: string; personId: string }> {
    const marca = etiqueta("sesion");
    // El club es una fila real desde T-202: `person.club_id` tiene llave foránea.
    const clubId = await crearClubDePrueba(prisma);
    const persona = await prisma.person.create({
      data: { clubId, fullName: "Jugadora de prueba" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso-para-el-test",
        status: opciones.estado ?? "active",
      },
    });

    const token = crearTokenDeSesion();
    // El mismo reloj que usa el guard, en vez de `Date.now()`: P-08 vale también aquí, y así el
    // test no puede desfasarse de la hora contra la que se lo va a evaluar.
    const ahora = app.get<Clock>(CLOCK).now().getTime();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(token),
        expiresAt: new Date(ahora + (opciones.venceEn ?? 24 * HORA)),
        revokedAt: opciones.revocada === true ? new Date(ahora - HORA) : null,
      },
    });

    return { token, userAccountId: cuenta.id, personId: persona.id };
  }

  function pedirCon(token: string | null): request.Test {
    const peticion = request(app.getHttpServer()).get("/protegido");

    return token === null ? peticion : peticion.set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token));
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [ModuloProtegido] }).compile();
    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("deja pasar sólo a una sesión viva", () => {
    it("con sesión válida responde el usuario, con su cuenta y su persona", async () => {
      const { token, userAccountId, personId } = await crearSesion();

      const respuesta = await pedirCon(token);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({ userAccountId, personId });
      expect(respuesta.body.sessionId).toEqual(expect.any(String));
    });

    it("el token en claro no queda en la base: sólo viaja en la cookie", async () => {
      const { token } = await crearSesion();

      const porTokenEnClaro = await prisma.session.findUnique({ where: { tokenHash: token } });
      const porHash = await prisma.session.findUnique({
        where: { tokenHash: hashDeTokenDeSesion(token) },
      });

      expect(porTokenEnClaro).toBeNull();
      expect(porHash).not.toBeNull();
    });
  });

  describe("rechaza con 401", () => {
    it("sin cookie de sesión", async () => {
      const respuesta = await pedirCon(null);

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("con una cookie inventada", async () => {
      const respuesta = await pedirCon(crearTokenDeSesion());

      expect(respuesta.status).toBe(401);
    });

    it("con una sesión revocada — «cerrar sesión» tiene que servir de verdad", async () => {
      const { token } = await crearSesion({ revocada: true });

      expect((await pedirCon(token)).status).toBe(401);
    });

    it("con una sesión vencida", async () => {
      const { token } = await crearSesion({ venceEn: -HORA });

      expect((await pedirCon(token)).status).toBe(401);
    });

    it("con una sesión que vence en este mismo instante — el borde no concede", async () => {
      const { token } = await crearSesion({ venceEn: 0 });

      expect((await pedirCon(token)).status).toBe(401);
    });

    it("con la cuenta suspendida aunque la sesión siga viva (segunda barrera de T-056)", async () => {
      const { token } = await crearSesion({ estado: "suspended" });

      expect((await pedirCon(token)).status).toBe(401);
    });

    it("con la cuenta archivada", async () => {
      const { token } = await crearSesion({ estado: "archived" });

      expect((await pedirCon(token)).status).toBe(401);
    });
  });

  it("los rechazos son indistinguibles entre sí (P-12, docs/03 §3)", async () => {
    // Si el cuerpo delatara el motivo, quien prueba cookies robadas sabría cuáles fueron válidas
    // alguna vez. Se comparan sin el `requestId`, que es distinto por definición en cada solicitud.
    const revocada = await crearSesion({ revocada: true });
    const vencida = await crearSesion({ venceEn: -HORA });
    const suspendida = await crearSesion({ estado: "suspended" });

    // Secuencial y no en paralelo: `supertest` levanta un servidor efímero por solicitud, y cinco
    // a la vez sobre el mismo `httpServer` se caen con ECONNRESET. Es una limitación del andamiaje
    // de pruebas, no del guard.
    const cuerpos: Record<string, unknown>[] = [];

    for (const token of [null, crearTokenDeSesion(), revocada.token, vencida.token, suspendida.token]) {
      const { body } = await pedirCon(token);
      const resto: Record<string, unknown> = { ...body.error };
      delete resto.requestId;

      cuerpos.push(resto);
    }

    expect(new Set(cuerpos.map((cuerpo) => JSON.stringify(cuerpo))).size).toBe(1);
  });
});
