import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { COOKIE_DE_SESION, hashDeTokenDeSesion } from "../../src/common/auth/session-token.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";
const CONTRASENA = "la-que-se-olvido-2026";

describe("Restablecimiento de contraseña (T-035, T-036)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let correo: string;
  let cuentaId: string;

  function pedir(email: string): request.Test {
    return request(app.getHttpServer())
      .post("/api/auth/password/forgot")
      .set("Host", `${club.slug}.${BASE}`)
      .send({ email });
  }

  function restablecer(cuerpo: Record<string, unknown>): request.Test {
    return request(app.getHttpServer())
      .post("/api/auth/password/reset")
      .set("Host", `${club.slug}.${BASE}`)
      .send(cuerpo);
  }

  /** El token en claro no queda en ninguna parte legible: se lee del enlace que fue al correo. */
  async function ultimoEnlace(email: string): Promise<string> {
    const mensaje = await prisma.outboxMessage.findFirstOrThrow({
      where: { type: "identity.send-password-reset", payload: { path: ["email"], equals: email } },
      orderBy: { createdAt: "desc" },
    });
    const payload = mensaje.payload as { link?: string };

    return (payload.link ?? "").split("token=")[1] ?? "";
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

    const slug = etiqueta("olvido").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club olvidadizo" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: "Persona olvidadiza" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${etiqueta("olvido")}@ejemplo.test`,
        passwordHash: await app.get(PasswordService).hash(CONTRASENA),
        status: "active",
      },
    });
    correo = cuenta.email;
    cuentaId = cuenta.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("pedir el enlace (T-035)", () => {
    it("responde lo mismo exista o no la cuenta (R-010-07)", async () => {
      // Es la contracara del login: si aquí dijéramos «ese correo no existe», daría igual todo el
      // cuidado que se puso allá.
      const existente = await pedir(correo);
      const inexistente = await pedir(`${etiqueta("nadie")}@ejemplo.test`);

      expect(existente.status).toBe(202);
      expect(inexistente.status).toBe(202);
      expect(existente.body).toEqual(inexistente.body);
    });

    it("encola el correo con un enlace utilizable", async () => {
      await pedir(correo);

      const token = await ultimoEnlace(correo);
      expect(token.length).toBeGreaterThan(20);

      const guardado = await prisma.oneTimeToken.findUnique({
        where: { tokenHash: hashDeTokenDeSesion(token) },
      });
      expect(guardado?.type).toBe("password_reset");
    });

    it("guarda el hash del token, nunca el token", async () => {
      await pedir(correo);
      const token = await ultimoEnlace(correo);

      expect(await prisma.oneTimeToken.findUnique({ where: { tokenHash: token } })).toBeNull();
    });

    it("el enlace apunta al subdominio del club, no al Host de la solicitud", async () => {
      // Un `Host` falsificado convertiría el correo en un enlace al sitio del atacante con el token
      // de la víctima adentro.
      await request(app.getHttpServer())
        .post("/api/auth/password/forgot")
        .set("Host", `${club.slug}.${BASE}`)
        .set("X-Forwarded-Host", "sitio-del-atacante.com")
        .send({ email: correo });

      const mensaje = await prisma.outboxMessage.findFirstOrThrow({
        where: { type: "identity.send-password-reset", payload: { path: ["email"], equals: correo } },
        orderBy: { createdAt: "desc" },
      });

      expect(JSON.stringify(mensaje.payload)).toContain(`${club.slug}.${BASE}`);
      expect(JSON.stringify(mensaje.payload)).not.toContain("atacante");
    });

    it("una cuenta de otro club no recibe nada desde este subdominio (P-05)", async () => {
      const otroSlug = etiqueta("vecino").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
      const otroClub = await prisma.club.create({ data: { slug: otroSlug, name: "Club vecino" } });
      const personaAjena = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Ajena" },
      });
      const cuentaAjena = await prisma.userAccount.create({
        data: {
          personId: personaAjena.id,
          email: `${etiqueta("ajena")}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      });

      const respuesta = await pedir(cuentaAjena.email);

      expect(respuesta.status).toBe(202);
      expect(
        await prisma.outboxMessage.count({
          where: {
            type: "identity.send-password-reset",
            payload: { path: ["email"], equals: cuentaAjena.email },
          },
        }),
      ).toBe(0);
    });
  });

  describe("usar el enlace (T-036, R-010-09)", () => {
    it("cambia la contraseña y el enlace queda usado", async () => {
      await pedir(correo);
      const token = await ultimoEnlace(correo);

      const respuesta = await restablecer({
        token,
        newPassword: "la-nueva-del-olvido-1",
        newPasswordConfirmation: "la-nueva-del-olvido-1",
      });

      expect(respuesta.status).toBe(204);

      const usado = await prisma.oneTimeToken.findUniqueOrThrow({
        where: { tokenHash: hashDeTokenDeSesion(token) },
      });
      expect(usado.usedAt).not.toBeNull();
    });

    it("el mismo enlace no sirve dos veces (R-010-08)", async () => {
      await pedir(correo);
      const token = await ultimoEnlace(correo);
      const cuerpo = {
        token,
        newPassword: "otra-vez-nueva-22",
        newPasswordConfirmation: "otra-vez-nueva-22",
      };

      expect((await restablecer(cuerpo)).status).toBe(204);

      const segunda = await restablecer(cuerpo);
      expect(segunda.status).toBe(422);
      expect(segunda.body.error.code).toBe("RESET_LINK_INVALID");
    });

    it("un token inventado responde lo mismo que uno usado o vencido", async () => {
      // Distinguirlos le diría a quien prueba tokens cuáles existieron alguna vez; y para quien
      // tiene el enlace de su correo, la salida es la misma en los tres casos: pedir uno nuevo.
      const inventado = await restablecer({
        token: "token-que-nunca-existio",
        newPassword: "da-igual-2026",
        newPasswordConfirmation: "da-igual-2026",
      });

      expect(inventado.status).toBe(422);
      expect(inventado.body.error.code).toBe("RESET_LINK_INVALID");
    });

    it("revoca TODAS las sesiones: si alguien entró con credenciales robadas, queda afuera", async () => {
      const entrar = async (password: string): Promise<string> => {
        const respuesta = await request(app.getHttpServer())
          .post("/api/auth/login")
          .set("Host", `${club.slug}.${BASE}`)
          .send({ email: correo, password });
        const cookies = (respuesta.headers["set-cookie"] as unknown as string[]) ?? [];
        const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";

        return sesion.slice(`${COOKIE_DE_SESION}=`.length).split(";")[0] ?? "";
      };

      // Se parte de una contraseña conocida.
      await prisma.userAccount.update({
        where: { id: cuentaId },
        data: { passwordHash: await app.get(PasswordService).hash(CONTRASENA) },
      });
      const sesionViva = await entrar(CONTRASENA);
      expect(sesionViva.length).toBeGreaterThan(10);

      await pedir(correo);
      const token = await ultimoEnlace(correo);
      await restablecer({
        token,
        newPassword: "recuperada-del-todo-3",
        newPasswordConfirmation: "recuperada-del-todo-3",
      });

      const conLaSesionVieja = await request(app.getHttpServer())
        .get("/api/clubs/current")
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${sesionViva}`);

      expect(conLaSesionVieja.status).toBe(401);
    });

    it("aplica la política de contraseñas", async () => {
      await pedir(correo);
      const token = await ultimoEnlace(correo);

      const respuesta = await restablecer({
        token,
        newPassword: "password1",
        newPasswordConfirmation: "password1",
      });

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe("PASSWORD_POLICY");
    });

    it("levanta el bloqueo por intentos fallidos", async () => {
      // Quien acaba de demostrar que controla su correo no debería quedar esperando quince minutos
      // por sus propios errores de tipeo.
      await prisma.userAccount.update({
        where: { id: cuentaId },
        data: {
          failedAttempts: 5,
          lockedUntil: new Date(app.get<Clock>(CLOCK).now().getTime() + 900_000),
        },
      });

      await pedir(correo);
      const token = await ultimoEnlace(correo);
      await restablecer({
        token,
        newPassword: "sin-bloqueo-ya-44",
        newPasswordConfirmation: "sin-bloqueo-ya-44",
      });

      const cuenta = await prisma.userAccount.findUniqueOrThrow({ where: { id: cuentaId } });
      expect(cuenta.lockedUntil).toBeNull();
      expect(cuenta.failedAttempts).toBe(0);
    });

    it("avisa por correo que la contraseña cambió", async () => {
      // `docs/06`: los avisos de seguridad se mandan siempre. Si alguien no fue quien la cambió,
      // este correo es su única señal.
      await pedir(correo);
      const token = await ultimoEnlace(correo);
      await restablecer({
        token,
        newPassword: "con-aviso-incluido-5",
        newPasswordConfirmation: "con-aviso-incluido-5",
      });

      expect(
        await prisma.outboxMessage.count({
          where: {
            type: "identity.notify-password-changed",
            payload: { path: ["email"], equals: correo },
          },
        }),
      ).toBeGreaterThan(0);
    });
  });
});
