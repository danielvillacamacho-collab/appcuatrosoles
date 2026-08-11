import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { CalendarResponse } from "@polo/contracts";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { COOKIE_DE_SESION, crearTokenDeSesion, hashDeTokenDeSesion } from "../../src/common/auth/session-token.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";
const EL_DIA = "2026-09-01";

describe("Calendario del día (T-450, T-451)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let cancha: string;
  let maria: { cuentaId: string; token: string };
  let pedro: { cuentaId: string; token: string };

  function alas(hora: string, dia = EL_DIA): Date {
    return new Date(`${dia}T${hora}:00-05:00`);
  }

  async function crearCuenta(): Promise<{ cuentaId: string; token: string }> {
    const marca = etiqueta("cal");
    const persona = await prisma.person.create({ data: { clubId: club.id, fullName: `Persona ${marca}` } });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });
    await prisma.roleAssignment.create({
      data: { userAccountId: cuenta.id, role: "player", scope: "club", scopeId: club.id, grantedById: cuenta.id },
    });

    const token = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(token),
        expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
      },
    });

    return { cuentaId: cuenta.id, token };
  }

  function calendario(token: string, dia = EL_DIA): request.Test {
    return request(app.getHttpServer())
      .get(`/api/calendar?date=${dia}`)
      .set("Host", `${club.slug}.${BASE}`)
      .set("Cookie", `${COOKIE_DE_SESION}=${token}`);
  }

  async function reservar(datos: {
    desde: string;
    hasta: string;
    de: string;
    visibility: "public" | "private";
    dia?: string;
  }): Promise<string> {
    const creada = await prisma.fieldBooking.create({
      data: {
        clubId: club.id,
        fieldId: cancha,
        startsAt: alas(datos.desde, datos.dia),
        endsAt: alas(datos.hasta, datos.dia),
        type: "lesson",
        visibility: datos.visibility,
        sourceId: `origen-${etiqueta("s")}`,
        createdById: datos.de,
      },
      select: { id: true },
    });

    return creada.id;
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

    const slug = etiqueta("cal").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club del calendario" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    cancha = (await prisma.field.create({ data: { clubId: club.id, name: "Cancha 1" } })).id;
    await prisma.field.create({ data: { clubId: club.id, name: "Cancha 2" } });

    maria = await crearCuenta();
    pedro = await crearCuenta();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("el día, resuelto en la zona del club (T-450)", () => {
    it("un día sin nada devuelve las canchas con sus franjas vacías, no una lista vacía", async () => {
      // Una lista vacía podría significar «no hay canchas» o «no cargó». Tres canchas libres
      // significan una sola cosa.
      const respuesta = await calendario(maria.token, "2026-03-15");

      expect(respuesta.status).toBe(200);
      expect(CalendarResponse.safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body.fields).toHaveLength(2);
      expect(respuesta.body.fields[0].entries).toEqual([]);
      expect(respuesta.body.timezone).toBe("America/Bogota");
    });

    it("una actividad de las 7:00 p.m. aparece en ESE día, no en el siguiente", async () => {
      // Es el error que el cálculo existe para evitar: en UTC, las 7:00 p.m. de Bogotá ya son el
      // día siguiente.
      await reservar({ desde: "19:00", hasta: "20:30", de: maria.cuentaId, visibility: "public", dia: "2026-04-10" });

      const eseDia = await calendario(maria.token, "2026-04-10");
      const elSiguiente = await calendario(maria.token, "2026-04-11");

      expect(eseDia.body.fields[0].entries).toHaveLength(1);
      expect(elSiguiente.body.fields[0].entries).toHaveLength(0);
    });

    it("una fecha con formato de instante se rechaza: el día lo resuelve el club", async () => {
      const respuesta = await calendario(maria.token, "2026-09-01T10:00:00Z");

      expect(respuesta.status).toBe(400);
    });

    it("sin sesión no hay calendario", async () => {
      const respuesta = await request(app.getHttpServer())
        .get(`/api/calendar?date=${EL_DIA}`)
        .set("Host", `${club.slug}.${BASE}`);

      expect(respuesta.status).toBe(401);
    });
  });

  describe("la privacidad, que es la promesa del módulo (T-451, R-040-07)", () => {
    it("lo público se ve con detalle", async () => {
      await reservar({ desde: "08:00", hasta: "09:00", de: pedro.cuentaId, visibility: "public", dia: "2026-05-05" });

      const entrada = (await calendario(maria.token, "2026-05-05")).body.fields[0].entries[0];

      expect(entrada.detalle).toBe(true);
      expect(entrada.type).toBe("lesson");
    });

    it("quien la creó ve su propio detalle, aunque sea privada", async () => {
      await reservar({ desde: "08:00", hasta: "09:00", de: maria.cuentaId, visibility: "private", dia: "2026-05-06" });

      const entrada = (await calendario(maria.token, "2026-05-06")).body.fields[0].entries[0];

      expect(entrada.detalle).toBe(true);
    });

    it("lo privado de otro es sólo «Ocupado»: horario y nada más", async () => {
      await reservar({ desde: "08:00", hasta: "09:00", de: pedro.cuentaId, visibility: "private", dia: "2026-05-07" });

      const entrada = (await calendario(maria.token, "2026-05-07")).body.fields[0].entries[0];

      expect(entrada).toEqual({
        detalle: false,
        startsAt: alas("08:00", "2026-05-07").toISOString(),
        endsAt: alas("09:00", "2026-05-07").toISOString(),
      });
    });

    it("LA RESPUESTA ENTERA no contiene ningún identificador de lo ajeno y privado", async () => {
      // **Éste es el test que protege la promesa del spec**: nadie debe poder deducir del calendario
      // quién toma clases o taquea a cierta hora.
      //
      // Se serializa la respuesta completa y se busca en el texto, en vez de comprobar campo por
      // campo. Comprobar que `type` viene vacío no alcanza: el día que alguien agregue un dato a la
      // respuesta —el nombre del profesor, el identificador de la clase— se lo va a agregar sin
      // pensar en este caso, y un test que mira campos conocidos no lo vería.
      const dia = "2026-05-08";
      const idAjeno = await reservar({
        desde: "08:00",
        hasta: "09:00",
        de: pedro.cuentaId,
        visibility: "private",
        dia,
      });
      const ajena = await prisma.fieldBooking.findUniqueOrThrow({ where: { id: idAjeno } });

      const respuesta = await calendario(maria.token, dia);
      const comoTexto = JSON.stringify(respuesta.body);

      for (const rastro of [idAjeno, ajena.sourceId ?? "", pedro.cuentaId, "lesson"]) {
        expect(comoTexto, `la respuesta filtró «${rastro}»`).not.toContain(rastro);
      }
    });

    it("dos personas distintas ven el mismo día de forma distinta", async () => {
      // La misma franja, la misma consulta: lo que cambia es quién pregunta.
      const dia = "2026-05-09";
      await reservar({ desde: "08:00", hasta: "09:00", de: pedro.cuentaId, visibility: "private", dia });

      const loQueVePedro = (await calendario(pedro.token, dia)).body.fields[0].entries[0];
      const loQueVeMaria = (await calendario(maria.token, dia)).body.fields[0].entries[0];

      expect(loQueVePedro.detalle).toBe(true);
      expect(loQueVeMaria.detalle).toBe(false);
      expect(loQueVePedro.startsAt).toBe(loQueVeMaria.startsAt);
    });

    it("una reserva cancelada no aparece para nadie", async () => {
      const dia = "2026-05-10";
      const id = await reservar({ desde: "08:00", hasta: "09:00", de: maria.cuentaId, visibility: "public", dia });
      await prisma.fieldBooking.update({
        where: { id },
        data: { cancelledAt: new Date("2026-05-09T12:00:00Z") },
      });

      expect((await calendario(maria.token, dia)).body.fields[0].entries).toHaveLength(0);
    });

    it("el calendario de otro club no se alcanza desde este subdominio (P-05)", async () => {
      const ajeno = await prisma.club.create({
        data: { slug: `ajeno-${etiqueta("cal")}`.toLowerCase().slice(0, 40), name: "Otro club" },
      });
      const canchaAjena = await prisma.field.create({ data: { clubId: ajeno.id, name: "Cancha ajena" } });
      const dia = "2026-05-11";
      await prisma.fieldBooking.create({
        data: {
          clubId: ajeno.id,
          fieldId: canchaAjena.id,
          startsAt: alas("08:00", dia),
          endsAt: alas("09:00", dia),
          type: "practice",
          createdById: maria.cuentaId,
        },
      });

      const respuesta = await calendario(maria.token, dia);

      expect(JSON.stringify(respuesta.body)).not.toContain(canchaAjena.id);
      expect(respuesta.body.fields.every((c: { entries: unknown[] }) => c.entries.length === 0)).toBe(true);
    });
  });
});
