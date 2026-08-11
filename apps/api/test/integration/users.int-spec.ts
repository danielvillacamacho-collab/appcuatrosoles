import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { UserResponse } from "@polo/contracts";
import type { Clock, RoleName, ScopeKind } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { CABECERA_CSRF, tokenCsrfParaSesion } from "../../src/common/auth/csrf.js";
import {
  COOKIE_DE_SESION,
  crearTokenDeSesion,
  hashDeTokenDeSesion,
} from "../../src/common/auth/session-token.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";

describe("Gestión de usuarios (sección F)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let otroClub: { id: string; slug: string };
  let organizacionId: string;
  let categoriaId: string;
  let tokenAdmin: string;
  let cuentaAdminId: string;
  let tokenJugador: string;

  async function crearActor(
    clubId: string,
    role: RoleName,
    scope: ScopeKind,
    scopeId: string | null,
  ): Promise<{ token: string; cuentaId: string }> {
    const marca = etiqueta("actor");
    const persona = await prisma.person.create({ data: { clubId, fullName: `Actor ${role}` } });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });
    await prisma.roleAssignment.create({
      data: { userAccountId: cuenta.id, role, scope, scopeId, grantedById: cuenta.id },
    });

    const token = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(token),
        expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
      },
    });

    return { token, cuentaId: cuenta.id };
  }

  function con(token: string, slug = club.slug) {
    const base = (metodo: "get" | "post" | "patch" | "delete", ruta: string) => {
      const agente = request(app.getHttpServer());

      return agente[metodo](ruta)
        .set("Host", `${slug}.${BASE}`)
        .set("Cookie", `${COOKIE_DE_SESION}=${token}`)
        .set(CABECERA_CSRF, tokenCsrfParaSesion(token));
    };

    return {
      get: (ruta: string) => base("get", ruta),
      post: (ruta: string) => base("post", ruta),
      patch: (ruta: string) => base("patch", ruta),
      delete: (ruta: string) => base("delete", ruta),
    };
  }

  interface DatosDeUsuario extends Record<string, unknown> {
    email: string;
  }

  function datosDeUsuario(extra: Record<string, unknown> = {}): DatosDeUsuario {
    const marca = etiqueta("nuevo");

    return {
      fullName: "Persona nueva",
      email: `${marca}@ejemplo.test`,
      roles: ["player"],
      ...extra,
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

    const crearClub = async (prefijo: string) => {
      const slug = etiqueta(prefijo).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
      const creado = await prisma.club.create({ data: { slug, name: `Club ${prefijo}` } });

      return { id: creado.id, slug: creado.slug };
    };

    club = await crearClub("usuarios");
    otroClub = await crearClub("vecino");
    app.get(ClubDirectory).invalidate();

    const organizacion = await prisma.organization.create({
      data: { clubId: club.id, name: `Escuela ${etiqueta("o")}`, type: "school" },
    });
    organizacionId = organizacion.id;

    const categoria = await prisma.membershipCategory.create({
      data: {
        clubId: club.id,
        code: `socio-${etiqueta("c")}`,
        name: "Socio",
        monthlyFeeCents: 0n,
        rights: {},
      },
    });
    categoriaId = categoria.id;

    const admin = await crearActor(club.id, "club_admin", "club", club.id);
    tokenAdmin = admin.token;
    cuentaAdminId = admin.cuentaId;
    tokenJugador = (await crearActor(club.id, "player", "club", club.id)).token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("crear e invitar (T-050 a T-053)", () => {
    it("crea la cuenta invitada y encola su invitación", async () => {
      const datos = datosDeUsuario({ membershipCategoryId: categoriaId, phone: "+57 300 111 2222" });

      const respuesta = await con(tokenAdmin).post("/users").send(datos);

      expect(respuesta.status).toBe(201);
      expect(UserResponse.safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body.status).toBe("invited");
      expect(respuesta.body.membershipCategory.id).toBe(categoriaId);

      const encolados = await prisma.outboxMessage.count({
        where: {
          type: "identity.send-invitation",
          payload: { path: ["email"], equals: datos.email },
        },
      });
      expect(encolados).toBe(1);
    });

    describe("la variante ligera: invitar con sólo el correo (HU-010-02)", () => {
      async function invitarSoloConCorreo(): Promise<{ id: string; email: string }> {
        const email = `${etiqueta("ligera")}@ejemplo.test`;
        const creado = await con(tokenAdmin).post("/users").send({ email, roles: ["player"] });

        expect(creado.status).toBe(201);

        return { id: creado.body.id, email };
      }

      /** El token como lo saca quien recibe el correo: del enlace, no de la base. */
      async function tokenDelCorreoA(email: string): Promise<string> {
        const mensaje = await prisma.outboxMessage.findFirstOrThrow({
          where: { payload: { path: ["email"], equals: email } },
          orderBy: { createdAt: "desc" },
        });

        return ((mensaje.payload as { link?: string }).link ?? "").split("token=")[1] ?? "";
      }

      function aceptar(cuerpo: Record<string, unknown>): request.Test {
        return request(app.getHttpServer())
          .post("/auth/invitation/accept")
          .set("Host", `${club.slug}.${BASE}`)
          .send(cuerpo);
      }

      it("la ficha nace con la parte local del correo, no en blanco", async () => {
        // Una lista de usuarios con filas en blanco es peor que una con nombres feos: el
        // administrador no sabe a quién invitó.
        const { id, email } = await invitarSoloConCorreo();
        const visto = await con(tokenAdmin).get(`/users/${id}`);

        expect(visto.body.fullName).toBe(email.replace(/@.*$/u, ""));
      });

      it("la persona pone su nombre al aceptar, y ése es el que queda", async () => {
        const { id, email } = await invitarSoloConCorreo();

        const aceptada = await aceptar({
          token: await tokenDelCorreoA(email),
          newPassword: "la-clave-que-yo-elijo-5",
          newPasswordConfirmation: "la-clave-que-yo-elijo-5",
          fullName: "María Fernanda Pérez",
          phone: "+57 300 999 8888",
        });

        expect(aceptada.status).toBe(204);

        const visto = await con(tokenAdmin).get(`/users/${id}`);
        expect(visto.body.fullName).toBe("María Fernanda Pérez");
        expect(visto.body.phone).toBe("+57 300 999 8888");
      });

      it("pero no se renombra a quien el club ya nombró: el enlace no es para eso", async () => {
        const datos = datosDeUsuario({ fullName: "Nombre puesto por el club" });
        const creado = await con(tokenAdmin).post("/users").send(datos);

        await aceptar({
          token: await tokenDelCorreoA(datos.email),
          newPassword: "otra-clave-mia-larga-6",
          newPasswordConfirmation: "otra-clave-mia-larga-6",
          fullName: "El nombre que yo quiera",
        });

        const visto = await con(tokenAdmin).get(`/users/${creado.body.id}`);
        expect(visto.body.fullName).toBe("Nombre puesto por el club");
      });
    });

    it("dice cuándo se envió la invitación: sin eso, se reenvía a ciegas", async () => {
      // HU-010-01, criterio 3. Un administrador no puede distinguir una invitación de ayer de una
      // de hace tres semanas si sólo ve «invited».
      const creado = await con(tokenAdmin).post("/users").send(datosDeUsuario());

      expect(creado.body.invitationSentAt).not.toBeNull();
      expect(Number.isNaN(Date.parse(creado.body.invitationSentAt))).toBe(false);

      const activada = await prisma.userAccount.findUniqueOrThrow({ where: { id: creado.body.id } });
      await prisma.oneTimeToken.updateMany({
        where: { userAccountId: activada.id, type: "invitation" },
        data: { usedAt: new Date("2026-08-11T12:00:00.000Z") },
      });

      // Una invitación ya usada no dice nada sobre la que está esperando: no hay ninguna.
      const despues = await con(tokenAdmin).get(`/users/${creado.body.id}`);
      expect(despues.body.invitationSentAt).toBeNull();
    });

    describe("darle cuenta a alguien que ya está en el club (HU-010-03)", () => {
      it("usa la persona que existe en vez de crear otra, y conserva su historia", async () => {
        // El invitado externo de una copa, o el menor que cumplió la edad del club: si se creara
        // otra persona, el club quedaría con dos fichas del mismo jugador y el historial en la
        // vieja.
        const invitadoExterno = await prisma.person.create({
          data: { clubId: club.id, fullName: "Invitado de la copa", isMinor: true },
        });
        await prisma.membershipAssignment.create({
          data: {
            clubId: club.id,
            personId: invitadoExterno.id,
            membershipCategoryId: categoriaId,
            effectiveFrom: new Date("2026-01-01"),
            assignedById: cuentaAdminId,
          },
        });

        const creado = await con(tokenAdmin)
          .post("/users")
          .send(datosDeUsuario({ personId: invitadoExterno.id, fullName: "Nombre que se ignora" }));

        expect(creado.status).toBe(201);
        expect(creado.body.personId).toBe(invitadoExterno.id);
        // El nombre de alguien que ya está en el club no se cambia de paso al darle acceso.
        expect(creado.body.fullName).toBe("Invitado de la copa");
        // Y su historia sigue ahí: es lo que HU-010-10 pide al convertir un perfil de menor.
        expect(creado.body.membershipCategory.id).toBe(categoriaId);

        const personas = await prisma.person.count({
          where: { clubId: club.id, fullName: "Invitado de la copa" },
        });
        expect(personas).toBe(1);
      });

      it("deja de ser un perfil administrado por otro: desde ahora manda sobre lo suyo", async () => {
        const menor = await prisma.person.create({
          data: { clubId: club.id, fullName: "Menor que cumplió años", isMinor: true },
        });

        await con(tokenAdmin).post("/users").send(datosDeUsuario({ personId: menor.id }));

        const despues = await prisma.person.findUniqueOrThrow({ where: { id: menor.id } });
        expect(despues.isMinor).toBe(false);
      });

      it("una persona que ya tiene cuenta no recibe una segunda", async () => {
        // Serían dos formas de entrar a lo mismo, y ninguna sabría de la otra.
        const primera = await con(tokenAdmin).post("/users").send(datosDeUsuario());

        const segunda = await con(tokenAdmin)
          .post("/users")
          .send(datosDeUsuario({ personId: primera.body.personId }));

        expect(segunda.status).toBe(409);
        expect(segunda.body.error.code).toBe("la_persona_ya_tiene_cuenta");
      });

      it("una persona de otro club no existe desde aquí: 404, nunca 403 (P-05)", async () => {
        const ajeno = await prisma.club.create({
          data: { slug: `ajena-${etiqueta("u")}`.toLowerCase().slice(0, 40), name: "Club ajeno" },
        });
        const personaAjena = await prisma.person.create({
          data: { clubId: ajeno.id, fullName: "Persona de otro club" },
        });

        const respuesta = await con(tokenAdmin)
          .post("/users")
          .send(datosDeUsuario({ personId: personaAjena.id }));

        expect(respuesta.status).toBe(404);
      });
    });

    it("rechaza un correo duplicado (HU-010-01, segundo criterio)", async () => {
      const datos = datosDeUsuario();
      await con(tokenAdmin).post("/users").send(datos);

      const repetido = await con(tokenAdmin).post("/users").send(datosDeUsuario({ email: datos.email }));

      expect(repetido.status).toBe(409);
    });

    it("con la invitación se define la contraseña y la cuenta queda activa", async () => {
      const datos = datosDeUsuario();
      const creado = await con(tokenAdmin).post("/users").send(datos);

      const mensaje = await prisma.outboxMessage.findFirstOrThrow({
        where: { payload: { path: ["email"], equals: datos.email } },
        orderBy: { createdAt: "desc" },
      });
      const token = ((mensaje.payload as { link?: string }).link ?? "").split("token=")[1] ?? "";

      const aceptada = await request(app.getHttpServer())
        .post("/auth/invitation/accept")
        .set("Host", `${club.slug}.${BASE}`)
        .send({
          token,
          newPassword: "mi-primera-clave-9",
          newPasswordConfirmation: "mi-primera-clave-9",
        });

      expect(aceptada.status).toBe(204);

      const cuenta = await prisma.userAccount.findUniqueOrThrow({
        where: { id: creado.body.id as string },
      });
      expect(cuenta.status).toBe("active");

      // Y con eso ya puede entrar.
      const login = await request(app.getHttpServer())
        .post("/auth/login")
        .set("Host", `${club.slug}.${BASE}`)
        .send({ email: datos.email, password: "mi-primera-clave-9" });
      expect(login.status).toBe(200);
    });

    it("reenviar la invitación invalida el enlace anterior (T-053)", async () => {
      // Si el primero se filtró —un correo reenviado, un buzón compartido— reenviar tiene que
      // cerrarlo, no sumar un segundo enlace válido.
      const datos = datosDeUsuario();
      const creado = await con(tokenAdmin).post("/users").send(datos);
      const primerMensaje = await prisma.outboxMessage.findFirstOrThrow({
        where: { payload: { path: ["email"], equals: datos.email } },
        orderBy: { createdAt: "desc" },
      });
      const primerToken =
        ((primerMensaje.payload as { link?: string }).link ?? "").split("token=")[1] ?? "";

      await con(tokenAdmin).post(`/users/${creado.body.id}/invite`);

      const conElViejo = await request(app.getHttpServer())
        .post("/auth/invitation/accept")
        .set("Host", `${club.slug}.${BASE}`)
        .send({ token: primerToken, newPassword: "no-deberia-1", newPasswordConfirmation: "no-deberia-1" });

      expect(conElViejo.status).toBe(422);
    });

    it("un administrador de organización sólo otorga roles de la suya (T-052, R-010-04)", async () => {
      const { token } = await crearActor(club.id, "organization_admin", "organization", organizacionId);

      const conRolDeClub = await con(token)
        .post("/users")
        .send(datosDeUsuario({ roles: ["club_admin"] }));
      const conRolDeSuOrganizacion = await con(token)
        .post("/users")
        .send(datosDeUsuario({ roles: ["instructor"], organizationId: organizacionId }));

      expect(conRolDeClub.status).toBe(403);
      expect(conRolDeSuOrganizacion.status).toBe(201);
    });

    it("un jugador no crea usuarios", async () => {
      expect((await con(tokenJugador).post("/users").send(datosDeUsuario())).status).toBe(403);
    });
  });

  describe("listar y ver (T-054, T-055)", () => {
    it("filtra por estado, rol y texto", async () => {
      const datos = datosDeUsuario({ fullName: "Buscable Singular" });
      await con(tokenAdmin).post("/users").send(datos);

      const porTexto = await con(tokenAdmin).get("/users?q=Buscable");
      const porEstado = await con(tokenAdmin).get("/users?status=invited");

      expect(porTexto.body.some((u: { fullName: string }) => u.fullName === "Buscable Singular")).toBe(true);
      expect(porEstado.body.every((u: { status: string }) => u.status === "invited")).toBe(true);
    });

    it("nunca lista usuarios de otro club (T-054, aislamiento)", async () => {
      const personaAjena = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Ajena Invisible" },
      });
      await prisma.userAccount.create({
        data: {
          personId: personaAjena.id,
          email: `${etiqueta("ajeno")}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      });

      const lista = await con(tokenAdmin).get("/users");

      expect(lista.body.some((u: { fullName: string }) => u.fullName === "Ajena Invisible")).toBe(false);
    });

    it("un administrador de organización sólo ve a la gente de la suya (HU-010-08)", async () => {
      const { token } = await crearActor(club.id, "organization_admin", "organization", organizacionId);
      const deLaOrganizacion = await con(tokenAdmin)
        .post("/users")
        .send(datosDeUsuario({ roles: ["instructor"], organizationId: organizacionId }));
      const delClub = await con(tokenAdmin).post("/users").send(datosDeUsuario());

      const lista = await con(token).get("/users");
      const ids = lista.body.map((u: { id: string }) => u.id);

      expect(ids).toContain(deLaOrganizacion.body.id);
      expect(ids).not.toContain(delClub.body.id);
    });

    it("un usuario de otro club responde 404 por acceso directo (T-055)", async () => {
      const personaAjena = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Ajena Directa" },
      });
      const cuentaAjena = await prisma.userAccount.create({
        data: {
          personId: personaAjena.id,
          email: `${etiqueta("directo")}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      });

      expect((await con(tokenAdmin).get(`/users/${cuentaAjena.id}`)).status).toBe(404);
    });

    it("cambiar la categoría el MISMO día corrige la fila, no apila una segunda", async () => {
      // La base lo impone —`effective_to > effective_from`— y tiene sentido: una asignación que
      // empezó hoy nunca estuvo vigente un día completo, así que no hay historia que conservar.
      const creado = await con(tokenAdmin)
        .post("/users")
        .send(datosDeUsuario({ membershipCategoryId: categoriaId }));
      const otraCategoria = await prisma.membershipCategory.create({
        data: {
          clubId: club.id,
          code: `otra-${etiqueta("c")}`,
          name: "Estudiante",
          monthlyFeeCents: 0n,
          rights: {},
        },
      });

      const editado = await con(tokenAdmin)
        .patch(`/users/${creado.body.id}`)
        .send({ membershipCategoryId: otraCategoria.id });

      expect(editado.body.membershipCategory.id).toBe(otraCategoria.id);
      expect(
        await prisma.membershipAssignment.count({
          where: { personId: creado.body.personId as string },
        }),
      ).toBe(1);
    });

    it("cambiarla otro día SÍ deja historia: el club debe poder decir con qué categoría jugaba en marzo", async () => {
      const creado = await con(tokenAdmin)
        .post("/users")
        .send(datosDeUsuario({ membershipCategoryId: categoriaId }));
      const otraCategoria = await prisma.membershipCategory.create({
        data: {
          clubId: club.id,
          code: `historica-${etiqueta("c")}`,
          name: "Invitado",
          monthlyFeeCents: 0n,
          rights: {},
        },
      });

      // Se retrocede la asignación vigente para simular que empezó hace meses.
      await prisma.membershipAssignment.updateMany({
        where: { personId: creado.body.personId as string, effectiveTo: null },
        data: { effectiveFrom: new Date("2026-03-01") },
      });

      await con(tokenAdmin)
        .patch(`/users/${creado.body.id}`)
        .send({ membershipCategoryId: otraCategoria.id });

      const historial = await prisma.membershipAssignment.findMany({
        where: { personId: creado.body.personId as string },
        orderBy: { effectiveFrom: "asc" },
      });

      expect(historial).toHaveLength(2);
      expect(historial[0]?.effectiveTo).not.toBeNull();
      expect(historial[1]?.effectiveTo).toBeNull();
    });
  });

  describe("suspender, archivar y la auto-protección (T-056 a T-058)", () => {
    it("suspender revoca las sesiones activas en el acto", async () => {
      const datos = datosDeUsuario();
      const creado = await con(tokenAdmin).post("/users").send(datos);
      const sesion = await prisma.session.create({
        data: {
          userAccountId: creado.body.id as string,
          tokenHash: `hash-${etiqueta("s")}`,
          expiresAt: new Date("2030-01-01"),
        },
      });

      const suspendido = await con(tokenAdmin).post(`/users/${creado.body.id}/suspend`);

      expect(suspendido.status).toBe(200);
      expect(suspendido.body.status).toBe("suspended");

      const despues = await prisma.session.findUniqueOrThrow({ where: { id: sesion.id } });
      expect(despues.revokedAt).not.toBeNull();
    });

    it("archivar y restaurar conservan la historia", async () => {
      const creado = await con(tokenAdmin).post("/users").send(datosDeUsuario());

      expect((await con(tokenAdmin).post(`/users/${creado.body.id}/archive`)).body.status).toBe("archived");
      expect((await con(tokenAdmin).post(`/users/${creado.body.id}/restore`)).body.status).toBe("active");
      expect(await prisma.userAccount.count({ where: { id: creado.body.id as string } })).toBe(1);
    });

    it("nadie se suspende ni se archiva a sí mismo (R-010-05)", async () => {
      // Es lo que evita que el único administrador de un club se deje afuera por un clic.
      expect((await con(tokenAdmin).post(`/users/${cuentaAdminId}/suspend`)).status).toBe(403);
      expect((await con(tokenAdmin).post(`/users/${cuentaAdminId}/archive`)).status).toBe(403);
    });

    it("cada acción deja exactamente una fila de auditoría", async () => {
      const creado = await con(tokenAdmin).post("/users").send(datosDeUsuario());
      await con(tokenAdmin).post(`/users/${creado.body.id}/suspend`);

      const filas = await prisma.auditLog.findMany({ where: { entityId: creado.body.id as string } });
      const acciones = filas.map((fila) => fila.action);

      expect(acciones.filter((a) => a === "user.created")).toHaveLength(1);
      expect(acciones.filter((a) => a === "user.suspended")).toHaveLength(1);
    });
  });

  describe("roles (sección G: T-060 a T-062)", () => {
    it("otorgar un rol lo deja vigente y auditado (T-060, R-010-11)", async () => {
      const creado = await con(tokenAdmin).post("/users").send(datosDeUsuario());

      const respuesta = await con(tokenAdmin)
        .post(`/users/${creado.body.id}/roles`)
        .send({ role: "commissioner", scope: "club" });

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.roles.map((r: { role: string }) => r.role)).toContain("commissioner");

      const auditoria = await prisma.auditLog.count({
        where: { entityId: creado.body.id as string, action: "role.assigned" },
      });
      expect(auditoria).toBe(1);
    });

    it("retirar un rol tiene efecto en la siguiente petición (T-061)", async () => {
      // Se le da club_admin a alguien, se comprueba que manda, se le retira y se comprueba que ya
      // no. Sin efecto inmediato, quien acaba de perder autoridad seguiría usándola.
      const marca = etiqueta("efimero");
      const persona = await prisma.person.create({
        data: { clubId: club.id, fullName: "Administrador efímero" },
      });
      const cuenta = await prisma.userAccount.create({
        data: {
          personId: persona.id,
          email: `${marca}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      });
      const token = crearTokenDeSesion();
      await prisma.session.create({
        data: {
          userAccountId: cuenta.id,
          tokenHash: hashDeTokenDeSesion(token),
          expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
        },
      });

      const otorgado = await con(tokenAdmin)
        .post(`/users/${cuenta.id}/roles`)
        .send({ role: "club_admin", scope: "club" });
      expect((await con(token).get("/users")).status).toBe(200);

      const asignacion = otorgado.body.roles.find((r: { role: string }) => r.role === "club_admin");
      await con(tokenAdmin).delete(`/users/${cuenta.id}/roles/${asignacion.id}`);

      expect((await con(token).get("/users")).status).toBe(403);
    });

    it("un administrador de organización no otorga roles de club (T-062, R-010-04)", async () => {
      const { token } = await crearActor(club.id, "organization_admin", "organization", organizacionId);
      const creado = await con(tokenAdmin)
        .post("/users")
        .send(datosDeUsuario({ roles: ["instructor"], organizationId: organizacionId }));

      const deClub = await con(token)
        .post(`/users/${creado.body.id}/roles`)
        .send({ role: "club_admin", scope: "club" });
      const deSuOrganizacion = await con(token)
        .post(`/users/${creado.body.id}/roles`)
        .send({ role: "groom", scope: "organization", organizationId: organizacionId });

      expect(deClub.status).toBe(403);
      expect(deSuOrganizacion.status).toBe(201);
    });

    it("nadie se retira roles a sí mismo (R-010-05)", async () => {
      const yo = await con(tokenAdmin).get(`/users/${cuentaAdminId}`);
      const suRol = yo.body.roles[0];

      const respuesta = await con(tokenAdmin).delete(`/users/${cuentaAdminId}/roles/${suRol.id}`);

      expect(respuesta.status).toBe(403);
    });

    it("el club nunca viaja en el cuerpo: mandarlo no cambia nada (R-020-01)", async () => {
      // El ámbito de club es siempre el del subdominio. Un `clubId` en el cuerpo se descarta al
      // validar el contrato, así que no hay forma de otorgar un rol en el club de al lado.
      const creado = await con(tokenAdmin).post("/users").send(datosDeUsuario());

      const respuesta = await con(tokenAdmin)
        .post(`/users/${creado.body.id}/roles`)
        .send({ role: "commissioner", scope: "club", clubId: otroClub.id, scopeId: otroClub.id });

      expect(respuesta.status).toBe(201);
      expect(
        respuesta.body.roles.find((r: { role: string }) => r.role === "commissioner").scopeId,
      ).toBe(club.id);
    });

    it("un rol de organización sin decir cuál se rechaza por contrato", async () => {
      const creado = await con(tokenAdmin).post("/users").send(datosDeUsuario());

      const respuesta = await con(tokenAdmin)
        .post(`/users/${creado.body.id}/roles`)
        .send({ role: "instructor", scope: "organization" });

      expect(respuesta.status).toBe(400);
    });
  });

  describe("exportar (T-059)", () => {
    it("devuelve CSV con el mismo filtro que el listado", async () => {
      const respuesta = await con(tokenAdmin).get("/users/export?status=invited");

      expect(respuesta.status).toBe(200);
      expect(respuesta.headers["content-type"]).toContain("text/csv");
      expect(respuesta.text.split("\n")[0]).toBe(
        '"nombre","correo","telefono","estado","categoria","roles"',
      );
    });

    it("escapa comillas y comas: un nombre con coma no parte la fila", async () => {
      await con(tokenAdmin).post("/users").send(datosDeUsuario({ fullName: 'Pérez, "Pepe"' }));

      const respuesta = await con(tokenAdmin).get("/users/export");

      expect(respuesta.text).toContain('"Pérez, ""Pepe"""');
    });

    it("un jugador no exporta nada", async () => {
      expect((await con(tokenJugador).get("/users/export")).status).toBe(403);
    });
  });
});
