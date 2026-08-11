import "reflect-metadata";
import { readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { LoginResponse, MeResponse } from "@polo/contracts";
import { AppModule } from "../../src/app.module.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { CABECERA_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import { COOKIE_DE_SESION } from "../../src/common/auth/session-token.js";
import { OutboxProcessor } from "../../src/common/outbox/outbox.processor.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";
const CONTRASENA_ADMIN = "la-clave-de-la-admin-7";

/**
 * Sección K de `specs/010` — los tres recorridos completos, de punta a punta del API.
 *
 * **El buzón es de verdad**: el correo no se lee de la tabla `outbox_message` sino del `.html` que
 * `MailerDeArchivo` escribe en disco, y el token se saca del enlace tal como lo sacaría alguien
 * haciendo clic. Es lo que hace que estos tests digan algo sobre el producto y no sobre la base de
 * datos: si el enlace del correo sale mal armado, aquí se cae.
 *
 * **No es el E2E de navegador** que pide `docs/05` §7 — `apps/web` todavía no tiene estas pantallas.
 * Cubre el API completo; el de navegador entra cuando exista la interfaz.
 *
 * Hay **un solo paso «a mano»**: el club y su primera administradora. En la vida real salen del
 * arranque de la instalación (`prisma/bootstrap.ts`, T-232), que es idempotente y sólo corre cuando
 * no hay ningún club — así que no se puede usar contra una base compartida por toda la suite.
 */
describe("Identidad de punta a punta (sección K)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let procesador: OutboxProcessor;
  let club: { id: string; slug: string };
  let correoAdmin: string;
  const buzon = resolve("./.correos-e2e");

  /** Lo que hace un navegador: recibe el correo, abre el enlace, saca el token. */
  async function tokenDelUltimoCorreoA(email: string): Promise<string> {
    await procesador.procesarPendientes(500);

    const archivos = (await readdir(buzon)).filter((nombre) => nombre.includes(email)).sort();
    const ultimo = archivos.at(-1);

    expect(ultimo, `no llegó ningún correo a ${email}`).toBeDefined();

    const html = await readFile(join(buzon, ultimo ?? ""), "utf8");
    const enlace = /href="([^"]*token=[^"]+)"/u.exec(html);

    expect(enlace, "el correo no traía un enlace con token").not.toBeNull();

    return new URL(enlace?.[1] ?? "").searchParams.get("token") ?? "";
  }

  function anonimo(metodo: "get" | "post", ruta: string): request.Test {
    return request(app.getHttpServer())[metodo](ruta).set("Host", `${club.slug}.${BASE}`);
  }

  async function entrar(email: string, password: string): Promise<string> {
    const respuesta = await anonimo("post", "/auth/login").send({ email, password });

    expect(respuesta.status, `no pudo entrar ${email}`).toBe(200);
    expect(LoginResponse.safeParse(respuesta.body).success).toBe(true);

    const cookies = (respuesta.headers["set-cookie"] as unknown as string[]) ?? [];
    const sesion = cookies.find((c) => c.startsWith(`${COOKIE_DE_SESION}=`)) ?? "";

    return sesion.slice(`${COOKIE_DE_SESION}=`.length).split(";")[0] ?? "";
  }

  function con(token: string) {
    const base = (metodo: "get" | "post", ruta: string) =>
      anonimo(metodo, ruta)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token));

    return { get: (r: string) => base("get", r), post: (r: string) => base("post", r) };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    process.env.MAIL_DIR = buzon;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DOMAIN)
      .useValue(BASE)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    procesador = app.get(OutboxProcessor);

    // ── El único paso «a mano» ────────────────────────────────────────────────
    const marca = etiqueta("e2e").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug: marca, name: "Club del recorrido" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: "Administradora del club" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}-admin@ejemplo.test`,
        passwordHash: await app.get(PasswordService).hash(CONTRASENA_ADMIN),
        status: "active",
      },
    });
    await prisma.roleAssignment.create({
      data: {
        userAccountId: cuenta.id,
        role: "club_admin",
        scope: "club",
        scopeId: club.id,
        grantedById: cuenta.id,
      },
    });
    correoAdmin = cuenta.email;
  });

  afterAll(async () => {
    await app.close();
    await rm(buzon, { recursive: true, force: true });
  });

  describe("T-100 · de la invitación al panel propio", () => {
    it("la administradora crea el usuario, le llega el correo, define su contraseña y entra", async () => {
      const admin = await entrar(correoAdmin, CONTRASENA_ADMIN);
      const correoNuevo = `${etiqueta("invitado")}@ejemplo.test`;

      const creado = await con(admin)
        .post("/users")
        .send({ fullName: "Jugador invitado", email: correoNuevo, roles: ["player"] });

      expect(creado.status).toBe(201);
      expect(creado.body.status).toBe("invited");

      const token = await tokenDelUltimoCorreoA(correoNuevo);
      const aceptada = await anonimo("post", "/auth/invitation/accept").send({
        token,
        newPassword: "mi-primera-clave-8",
        newPasswordConfirmation: "mi-primera-clave-8",
      });

      expect(aceptada.status).toBe(204);

      const sesion = await entrar(correoNuevo, "mi-primera-clave-8");
      const panel = await con(sesion).get("/me");

      expect(panel.status).toBe(200);
      expect(MeResponse.safeParse(panel.body).success).toBe(true);
      expect(panel.body.fullName).toBe("Jugador invitado");
      expect(panel.body.roles.map((rol: { role: string }) => rol.role)).toContain("player");
    });

    it("el mismo enlace no sirve dos veces: es de un solo uso", async () => {
      const admin = await entrar(correoAdmin, CONTRASENA_ADMIN);
      const correoNuevo = `${etiqueta("unavez")}@ejemplo.test`;

      await con(admin)
        .post("/users")
        .send({ fullName: "Invitado de un solo uso", email: correoNuevo, roles: ["player"] });

      const token = await tokenDelUltimoCorreoA(correoNuevo);
      const cuerpo = {
        token,
        newPassword: "otra-clave-larga-9",
        newPasswordConfirmation: "otra-clave-larga-9",
      };

      expect((await anonimo("post", "/auth/invitation/accept").send(cuerpo)).status).toBe(204);
      expect((await anonimo("post", "/auth/invitation/accept").send(cuerpo)).status).toBe(422);
    });
  });

  describe("T-101 · olvidar la contraseña cierra las demás sesiones (R-010-09)", () => {
    it("restablece desde el correo y la sesión del otro dispositivo deja de servir", async () => {
      // El caso que justifica la regla: alguien se robó la sesión, la víctima restablece, y la
      // sesión robada tiene que morir con el cambio. Si sobreviviera, restablecer no serviría de
      // nada contra el único ataque del que protege.
      const admin = await entrar(correoAdmin, CONTRASENA_ADMIN);
      const correoNuevo = `${etiqueta("olvido")}@ejemplo.test`;

      await con(admin)
        .post("/users")
        .send({ fullName: "Quien olvida", email: correoNuevo, roles: ["player"] });

      const invitacion = await tokenDelUltimoCorreoA(correoNuevo);
      await anonimo("post", "/auth/invitation/accept").send({
        token: invitacion,
        newPassword: "la-que-voy-a-olvidar-1",
        newPasswordConfirmation: "la-que-voy-a-olvidar-1",
      });

      const celular = await entrar(correoNuevo, "la-que-voy-a-olvidar-1");
      const computador = await entrar(correoNuevo, "la-que-voy-a-olvidar-1");

      expect((await con(celular).get("/me")).status).toBe(200);

      expect((await anonimo("post", "/auth/password/forgot").send({ email: correoNuevo })).status).toBe(202);

      const reset = await tokenDelUltimoCorreoA(correoNuevo);
      const cambiada = await anonimo("post", "/auth/password/reset").send({
        token: reset,
        newPassword: "la-nueva-de-verdad-2",
        newPasswordConfirmation: "la-nueva-de-verdad-2",
      });

      expect(cambiada.status).toBe(204);
      expect((await con(celular).get("/me")).status).toBe(401);
      expect((await con(computador).get("/me")).status).toBe(401);

      // Y con la nueva sí entra: restablecer no puede dejar a nadie fuera de su propia cuenta.
      const despues = await entrar(correoNuevo, "la-nueva-de-verdad-2");
      expect((await con(despues).get("/me")).status).toBe(200);
    });

    it("pedir el enlace para un correo que no existe responde igual que para uno que sí", async () => {
      // P-12: si la respuesta cambiara, esta ruta sería un buscador de cuentas del club.
      const inexistente = await anonimo("post", "/auth/password/forgot").send({
        email: `${etiqueta("fantasma")}@ejemplo.test`,
      });

      expect(inexistente.status).toBe(202);
    });
  });

  describe("T-102 · el acudiente administra el perfil de su hijo", () => {
    it("crea el menor, lo ve entre los suyos, firma por él y queda como quien paga", async () => {
      const admin = await entrar(correoAdmin, CONTRASENA_ADMIN);
      const correoAcudiente = `${etiqueta("acudiente")}@ejemplo.test`;

      const cuenta = await con(admin)
        .post("/users")
        .send({ fullName: "Madre de familia", email: correoAcudiente, roles: ["player"] });

      const invitacion = await tokenDelUltimoCorreoA(correoAcudiente);
      await anonimo("post", "/auth/invitation/accept").send({
        token: invitacion,
        newPassword: "la-clave-de-la-mama-3",
        newPasswordConfirmation: "la-clave-de-la-mama-3",
      });

      const menor = await con(admin).post("/minors").send({
        fullName: "Hijo que juega",
        birthdate: "2015-05-05",
        guardianPersonId: cuenta.body.personId,
      });

      expect(menor.status).toBe(201);

      const sesion = await entrar(correoAcudiente, "la-clave-de-la-mama-3");
      const aCargo = await con(sesion).get("/me/dependents");

      expect(aCargo.status).toBe(200);
      expect(aCargo.body).toHaveLength(1);
      expect(aCargo.body[0]).toMatchObject({
        personId: menor.body.personId,
        fullName: "Hijo que juega",
        isMinor: true,
        // R-010-10: el cobro del menor se consolida en el estado de cuenta de su pagador
        // principal vigente. **El cobro en sí es `specs/100`**; lo que este recorrido fija es que
        // la plataforma ya sabe a quién cobrarle, que es de lo que depende aquél.
        isPrimaryPayer: true,
      });

      // El waiver del menor lo firma su acudiente, y la lista lo refleja de inmediato: es lo que
      // le dice al club si ese niño puede entrar a la cancha (R-010-12).
      await con(admin)
        .post("/waivers")
        .send({ body: "Exención de responsabilidad del club, versión del recorrido." });

      expect((await con(sesion).get("/me/dependents")).body[0].waiverAccepted).toBe(false);

      const firmada = await con(sesion)
        .post("/waivers/current/accept")
        .send({ personId: menor.body.personId });

      expect(firmada.status).toBe(204);
      expect((await con(sesion).get("/me/dependents")).body[0].waiverAccepted).toBe(true);
    });

    it("el menor no tiene con qué entrar, y su acudiente no ve a los hijos de nadie más", async () => {
      const admin = await entrar(correoAdmin, CONTRASENA_ADMIN);
      const otroCorreo = `${etiqueta("otropadre")}@ejemplo.test`;

      const otro = await con(admin)
        .post("/users")
        .send({ fullName: "Otro padre", email: otroCorreo, roles: ["player"] });

      const invitacion = await tokenDelUltimoCorreoA(otroCorreo);
      await anonimo("post", "/auth/invitation/accept").send({
        token: invitacion,
        newPassword: "la-clave-del-otro-4",
        newPasswordConfirmation: "la-clave-del-otro-4",
      });

      const suyo = await con(admin).post("/minors").send({
        fullName: "Hija del otro",
        birthdate: "2016-06-06",
        guardianPersonId: otro.body.personId,
      });

      const sesion = await entrar(otroCorreo, "la-clave-del-otro-4");
      const aCargo = await con(sesion).get("/me/dependents");

      expect(aCargo.body.map((fila: { personId: string }) => fila.personId)).toEqual([
        suyo.body.personId,
      ]);

      // Y el menor no existe como cuenta: no hay a quién invitar ni contraseña que robar.
      const cuentaDelMenor = await prisma.userAccount.findUnique({
        where: { personId: suyo.body.personId },
      });
      expect(cuentaDelMenor).toBeNull();
    });
  });
});
