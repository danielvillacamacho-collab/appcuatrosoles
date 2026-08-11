import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { MeResponse, SessionResponse } from "@polo/contracts";
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
const CONTRASENA = "mi-propia-clave-2026";

describe("Perfil propio (T-040 a T-043)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let correo: string;
  let personaId: string;
  let cuentaId: string;

  async function entrar(): Promise<string> {
    const respuesta = await request(app.getHttpServer())
      .post("/api/auth/login")
      .set("Host", `${club.slug}.${BASE}`)
      .send({ email: correo, password: CONTRASENA });
    const cookies = (respuesta.headers["set-cookie"] as unknown as string[]) ?? [];
    const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";

    return sesion.slice(`${COOKIE_DE_SESION}=`.length).split(";")[0] ?? "";
  }

  function con(token: string) {
    const base = (metodo: "get" | "patch" | "post" | "delete", ruta: string) => {
      const agente = request(app.getHttpServer());

      return agente[metodo](ruta)
        .set("Host", `${club.slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token));
    };

    return {
      get: (ruta: string) => base("get", ruta),
      patch: (ruta: string) => base("patch", ruta),
      post: (ruta: string) => base("post", ruta),
      delete: (ruta: string) => base("delete", ruta),
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

    const slug = etiqueta("perfil").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club del perfil" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const organizacion = await prisma.organization.create({
      data: { clubId: club.id, name: `Escuela ${etiqueta("o")}`, type: "school" },
    });
    const categoria = await prisma.membershipCategory.create({
      data: { clubId: club.id, code: `socio-${etiqueta("c")}`, name: "Socio", monthlyFeeCents: 0n, rights: {} },
    });

    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: "Persona con perfil", notes: "NOTA INTERNA DEL CLUB" },
    });
    personaId = persona.id;

    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${etiqueta("perfil")}@ejemplo.test`,
        passwordHash: await app.get(PasswordService).hash(CONTRASENA),
        status: "active",
      },
    });
    correo = cuenta.email;
    cuentaId = cuenta.id;

    await prisma.roleAssignment.create({
      data: {
        userAccountId: cuenta.id,
        role: "player",
        scope: "club",
        scopeId: club.id,
        grantedById: cuenta.id,
      },
    });
    await prisma.personOrganization.create({
      data: {
        clubId: club.id,
        personId: persona.id,
        organizationId: organizacion.id,
        relationship: "student",
        joinedOn: new Date("2026-01-01"),
      },
    });
    await prisma.membershipAssignment.create({
      data: {
        clubId: club.id,
        personId: persona.id,
        membershipCategoryId: categoria.id,
        effectiveFrom: new Date("2026-01-01"),
        assignedById: cuenta.id,
      },
    });
  });

  beforeEach(async () => {
    await prisma.userAccount.update({
      where: { id: cuentaId },
      data: { pendingEmail: null, failedAttempts: 0, lockedUntil: null },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("ver el perfil (T-040)", () => {
    it("devuelve quién es, qué puede hacer y a qué pertenece", async () => {
      const respuesta = await con(await entrar()).get("/api/me");

      expect(respuesta.status).toBe(200);
      expect(MeResponse.safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body.roles).toHaveLength(1);
      expect(respuesta.body.organizations[0].relationship).toBe("student");
      expect(respuesta.body.membershipCategory.name).toBe("Socio");
    });

    it("NO expone campos administrativos sobre la persona", async () => {
      // Hay datos que son *sobre* alguien y no *para* alguien: las notas internas del club son el
      // ejemplo más claro. La respuesta se arma campo por campo justamente por esto.
      const respuesta = await con(await entrar()).get("/api/me");

      expect(JSON.stringify(respuesta.body)).not.toContain("NOTA INTERNA");
      expect(respuesta.body).not.toHaveProperty("status");
      expect(respuesta.body).not.toHaveProperty("notes");
    });

    it("sin sesión no hay perfil", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/api/me")
        .set("Host", `${club.slug}.${BASE}`);

      expect(respuesta.status).toBe(401);
    });
  });

  describe("editar el perfil (T-041)", () => {
    it("cambia teléfono y foto", async () => {
      const respuesta = await con(await entrar())
        .patch("/api/me")
        .send({ phone: "+57 300 000 0000", photoKey: "fotos/perfil.jpg" });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.phone).toBe("+57 300 000 0000");
    });

    it("mandar campos administrativos NO da error: se ignoran en silencio", async () => {
      // Un error revelaría que el campo existe a quien no debería tocarlo (T-041, segundo criterio).
      const antes = await prisma.person.findUniqueOrThrow({ where: { id: personaId } });

      const respuesta = await con(await entrar())
        .patch("/api/me")
        .send({ fullName: "Nombre Cambiado", categoryId: "otra", roles: ["club_admin"] });

      expect(respuesta.status).toBe(200);

      const despues = await prisma.person.findUniqueOrThrow({ where: { id: personaId } });
      expect(despues.fullName).toBe(antes.fullName);
      expect(respuesta.body.roles).toHaveLength(1);
    });
  });

  describe("cambiar el correo de acceso (T-042)", () => {
    it("el correo anterior sigue valiendo hasta confirmar el nuevo", async () => {
      // Si se cambiara de una y la confirmación no llegara, la persona quedaría sin poder entrar y
      // sin forma de recuperarlo: el restablecimiento iría a la dirección equivocada.
      const nuevo = `${etiqueta("nuevo")}@ejemplo.test`;

      const pedido = await con(await entrar())
        .post("/api/me/email-change")
        .send({ newEmail: nuevo, currentPassword: CONTRASENA });

      expect(pedido.status).toBe(202);

      const cuenta = await prisma.userAccount.findUniqueOrThrow({ where: { id: cuentaId } });
      expect(cuenta.email).toBe(correo);
      expect(cuenta.pendingEmail).toBe(nuevo);

      // Y se puede seguir entrando con el viejo.
      expect((await entrar()).length).toBeGreaterThan(10);
    });

    it("al confirmar, el nuevo reemplaza al anterior", async () => {
      const nuevo = `${etiqueta("confirmado")}@ejemplo.test`;
      await con(await entrar())
        .post("/api/me/email-change")
        .send({ newEmail: nuevo, currentPassword: CONTRASENA });

      const mensaje = await prisma.outboxMessage.findFirstOrThrow({
        where: { payload: { path: ["email"], equals: nuevo } },
        orderBy: { createdAt: "desc" },
      });
      const token = ((mensaje.payload as { link?: string }).link ?? "").split("token=")[1] ?? "";

      const confirmado = await con(await entrar())
        .post("/api/me/email-change/confirm")
        .send({ token });

      expect(confirmado.status).toBe(204);

      const cuenta = await prisma.userAccount.findUniqueOrThrow({ where: { id: cuentaId } });
      expect(cuenta.email).toBe(nuevo);
      expect(cuenta.pendingEmail).toBeNull();

      // Se deja como estaba para los demás tests del archivo.
      await prisma.userAccount.update({ where: { id: cuentaId }, data: { email: correo } });
    });

    it("exige la contraseña actual: es cambiar la llave de la cuenta", async () => {
      const respuesta = await con(await entrar())
        .post("/api/me/email-change")
        .send({ newEmail: `${etiqueta("otro")}@ejemplo.test`, currentPassword: "no-es-esa" });

      expect(respuesta.status).toBe(401);
    });

    it("un correo ya usado por otra cuenta se rechaza diciéndolo", async () => {
      // Aquí sí se dice, a diferencia del login: quien pregunta ya demostró ser el titular de esta
      // cuenta, y sin el aviso quedaría esperando una confirmación que nunca llega.
      const otraPersona = await prisma.person.create({
        data: { clubId: club.id, fullName: "Otra" },
      });
      const otra = await prisma.userAccount.create({
        data: {
          personId: otraPersona.id,
          email: `${etiqueta("ocupado")}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      });

      const respuesta = await con(await entrar())
        .post("/api/me/email-change")
        .send({ newEmail: otra.email, currentPassword: CONTRASENA });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("EMAIL_IN_USE");
    });
  });

  describe("dispositivos y sesiones (T-043)", () => {
    it("guarda de qué dispositivo se entró, o esa lista no sirve para nada", async () => {
      // Sin `user_agent`, «mis dispositivos» muestra un guion por fila y nadie puede reconocer —ni
      // dejar de reconocer— la sesión que no abrió. La columna existía desde T-002 y el login no
      // la llenaba; se descubrió al construir la pantalla (T-131).
      const respuesta = await request(app.getHttpServer())
        .post("/api/auth/login")
        .set("Host", `${club.slug}.${BASE}`)
        .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)")
        .send({ email: correo, password: CONTRASENA });

      expect(respuesta.status).toBe(200);

      const sesion = await prisma.session.findFirstOrThrow({
        where: { userAccountId: cuentaId },
        orderBy: { createdAt: "desc" },
      });

      expect(sesion.userAgent).toBe("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)");
    });

    it("lista las sesiones activas y marca cuál es la actual", async () => {
      const enElCelular = await entrar();
      const enLaComputadora = await entrar();

      const respuesta = await con(enLaComputadora).get("/api/me/sessions");

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.every((s: unknown) => SessionResponse.safeParse(s).success)).toBe(true);
      const actual = respuesta.body.filter((s: { current: boolean }) => s.current);
      expect(actual).toHaveLength(1);
      expect(respuesta.body.length).toBeGreaterThanOrEqual(2);
      expect(enElCelular).not.toBe(enLaComputadora);
    });

    it("cierra una sesión concreta desde la lista", async () => {
      const enElCelular = await entrar();
      const enLaComputadora = await entrar();

      const lista = await con(enLaComputadora).get("/api/me/sessions");
      const otra = lista.body.find((s: { current: boolean }) => !s.current);

      expect((await con(enLaComputadora).delete(`/api/me/sessions/${otra.id}`)).status).toBe(204);
      expect((await con(enElCelular).get("/api/me")).status).toBe(401);
    });

    it("no se puede cerrar la sesión de otra persona (404, nunca 403)", async () => {
      // Cerrar la sesión ajena adivinando un identificador sería un secuestro al revés.
      const otraPersona = await prisma.person.create({
        data: { clubId: club.id, fullName: "Ajena" },
      });
      const otraCuenta = await prisma.userAccount.create({
        data: {
          personId: otraPersona.id,
          email: `${etiqueta("ajenaSesion")}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      });
      const sesionAjena = await prisma.session.create({
        data: {
          userAccountId: otraCuenta.id,
          tokenHash: `hash-ajeno-${etiqueta("h")}`,
          expiresAt: new Date("2030-01-01"),
        },
      });

      const respuesta = await con(await entrar()).delete(`/api/me/sessions/${sesionAjena.id}`);

      expect(respuesta.status).toBe(404);

      const sigueViva = await prisma.session.findUniqueOrThrow({ where: { id: sesionAjena.id } });
      expect(sigueViva.revokedAt).toBeNull();
    });

    it("las sesiones cerradas no aparecen en la lista", async () => {
      const token = await entrar();
      const otra = await entrar();

      const lista = await con(token).get("/api/me/sessions");
      const aCerrar = lista.body.find((s: { current: boolean }) => !s.current);
      await con(token).delete(`/api/me/sessions/${aCerrar.id}`);

      const despues = await con(token).get("/api/me/sessions");

      expect(despues.body.map((s: { id: string }) => s.id)).not.toContain(aCerrar.id);
      expect(otra.length).toBeGreaterThan(10);
    });
  });
});
