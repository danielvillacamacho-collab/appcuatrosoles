import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { PracticeGridResponse } from "@polo/contracts";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { crearTokenDeSesion, hashDeTokenDeSesion } from "../../src/common/auth/session-token.js";
import { DecisionProcessor } from "../../src/practices/decision.processor.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { conSesion, etiqueta } from "../db.js";

const BASE = "polo.test";

/** Un reloj movible: hace falta para que la decisión automática dispare cuando el test quiere. */
class RelojDePrueba implements Clock {
  private instante = new Date("2026-05-01T12:00:00Z");

  now(): Date {
    return this.instante;
  }

  mover(a: string): void {
    this.instante = new Date(a);
  }
}

interface Cuenta {
  cuentaId: string;
  personId: string;
  token: string;
}

/**
 * La ventana de este archivo va **antes** que la de todos los demás, con la lección de
 * `practice-decision.int-spec`: el proceso de decisión es global y se lleva el cupo de `take`.
 */
const CUANDO = {
  startsAt: "2026-05-10T16:00:00.000Z",
  endsAt: "2026-05-10T17:30:00.000Z",
  closeAt: "2026-05-10T14:00:00.000Z",
  decisionAt: "2026-05-10T15:00:00.000Z",
};

describe("Grilla · API (T-722 a T-727)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let proceso: DecisionProcessor;
  const reloj = new RelojDePrueba();

  let club: { id: string; slug: string };
  let fieldId: string;
  let comisario: Cuenta;
  let jugadores: Cuenta[];
  let siguienteFranja = 0;

  async function crearCuenta(rol: string, handicapHalves?: number): Promise<Cuenta> {
    const marca = etiqueta("gr");
    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: `Persona ${marca}` },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });

    await prisma.roleAssignment.create({
      data: {
        userAccountId: cuenta.id,
        role: rol as "commissioner",
        scope: "club",
        scopeId: club.id,
        grantedById: cuenta.id,
      },
    });

    if (handicapHalves !== undefined) {
      await prisma.playerHandicap.create({
        data: { clubId: club.id, personId: persona.id, type: "club", valueHalves: handicapHalves },
      });
    }

    const token = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(token),
        expiresAt: new Date("2027-01-01T00:00:00Z"),
      },
    });

    return { cuentaId: cuenta.id, personId: persona.id, token };
  }

  function api(): request.SuperTest<request.Test> {
    return request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>;
  }

  function como(quien: Cuenta, peticion: request.Test): request.Test {
    return conSesion(peticion.set("Host", `${club.slug}.${BASE}`), quien.token);
  }

  /** Una práctica confirmada por el proceso, con los jugadores que se le pasen. */
  async function practicaConfirmada(quienes: Cuenta[]): Promise<string> {
    siguienteFranja += 1;
    const dia = 10 + Math.floor(siguienteFranja / 6);
    const hora = 12 + (siguienteFranja % 6);
    const base = `2026-05-${String(dia).padStart(2, "0")}`;

    const reserva = await prisma.fieldBooking.create({
      data: {
        clubId: club.id,
        fieldId,
        startsAt: new Date(`${base}T${String(hora).padStart(2, "0")}:00:00.000Z`),
        endsAt: new Date(`${base}T${String(hora).padStart(2, "0")}:45:00.000Z`),
        type: "practice",
        createdById: comisario.cuentaId,
      },
    });

    const practica = await prisma.practice.create({
      data: {
        clubId: club.id,
        fieldId,
        startsAt: new Date(CUANDO.startsAt),
        endsAt: new Date(CUANDO.endsAt),
        chukkers: 6,
        handicapType: "club",
        targetPlayers: quienes.length,
        minPlayers: 1,
        applicationsCloseAt: new Date(CUANDO.closeAt),
        decisionAt: new Date(CUANDO.decisionAt),
        status: "published",
        fieldBookingId: reserva.id,
        createdById: comisario.cuentaId,
      },
      select: { id: true },
    });

    for (const quien of quienes) {
      await prisma.practiceApplication.create({
        data: {
          clubId: club.id,
          practiceId: practica.id,
          personId: quien.personId,
          chukkersOffered: 4,
        },
      });
    }

    reloj.mover(CUANDO.decisionAt);
    await proceso.decidirVencidas();

    return practica.id;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DOMAIN)
      .useValue(BASE)
      .overrideProvider(CLOCK)
      .useValue(reloj)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    proceso = app.get(DecisionProcessor);

    const creado = await prisma.club.create({
      data: { slug: `gra-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club de la grilla" },
    });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    fieldId = (await prisma.field.create({ data: { clubId: club.id, name: "Cancha 1" } })).id;

    comisario = await crearCuenta("commissioner");
    jugadores = [
      await crearCuenta("player", 8),
      await crearCuenta("player", 6),
      await crearCuenta("player", 6),
      await crearCuenta("player", 4),
    ];
  });

  afterAll(async () => {
    await app.close();
  });

  /** Una práctica con equipos ya aprobados, que es cuando la grilla existe. */
  async function practicaConGrilla(): Promise<string> {
    const practiceId = await practicaConfirmada(jugadores);
    await como(comisario, api().post(`/api/practices/${practiceId}/teams/approve`).send({}));

    return practiceId;
  }

  describe("ver la grilla (T-722)", () => {
    it("cualquiera con sesión en el club la ve, sin permiso especial", async () => {
      const practiceId = await practicaConGrilla();

      const respuesta = await como(
        jugadores[0] as Cuenta,
        api().get(`/api/practices/${practiceId}/grid`),
      );

      expect(respuesta.status).toBe(200);
      const grilla = PracticeGridResponse.parse(respuesta.body);
      expect(grilla.chukkers).toBe(6);
      expect(grilla.celdas).toHaveLength(24);
      expect(grilla.cerrada).toBe(false);
    });

    it("la cuenta por persona viaja calculada, y son 6 para cada uno", async () => {
      // La pantalla la muestra, no la recalcula: es el mismo número que va a usar el cobro.
      const practiceId = await practicaConGrilla();

      const respuesta = await como(comisario, api().get(`/api/practices/${practiceId}/grid`));
      const grilla = PracticeGridResponse.parse(respuesta.body);

      expect(grilla.chukkersPorPersona).toHaveLength(4);
      expect(grilla.chukkersPorPersona.every((fila) => fila.chukkers === 6)).toBe(true);
      expect(grilla.chukkersPorPersona.every((fila) => fila.fullName.length > 0)).toBe(true);
    });

    it("una práctica SIN equipos aprobados no tiene grilla: 404", async () => {
      const practiceId = await practicaConfirmada(jugadores);

      const respuesta = await como(comisario, api().get(`/api/practices/${practiceId}/grid`));

      expect(respuesta.status).toBe(404);
    });

    it("el comisario de OTRO club recibe 404, nunca 403 (P-05)", async () => {
      // Un usuario de verdad del otro club, con su sesión: es la única forma de que la petición
      // llegue hasta el servicio y el 404 signifique algo. Con la sesión de este club, el guard de
      // tenant respondería antes y el test no probaría el aislamiento de la grilla.
      const otroClub = await prisma.club.create({
        data: { slug: `ajena-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club ajeno" },
      });
      app.get(ClubDirectory).invalidate();

      const persona = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Comisario ajeno" },
      });
      const cuenta = await prisma.userAccount.create({
        data: {
          personId: persona.id,
          email: `${etiqueta("ajeno")}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      });
      await prisma.roleAssignment.create({
        data: {
          userAccountId: cuenta.id,
          role: "commissioner",
          scope: "club",
          scopeId: otroClub.id,
          grantedById: cuenta.id,
        },
      });
      const token = crearTokenDeSesion();
      await prisma.session.create({
        data: {
          userAccountId: cuenta.id,
          tokenHash: hashDeTokenDeSesion(token),
          expiresAt: new Date("2027-01-01T00:00:00Z"),
        },
      });

      const practiceId = await practicaConGrilla();

      const respuesta = await conSesion(
        api().get(`/api/practices/${practiceId}/grid`).set("Host", `${otroClub.slug}.${BASE}`),
        token,
      );

      expect(respuesta.status, "404 y no 403: un 403 confirmaría que la práctica existe").toBe(404);
    });

    it("sin sesión no se ve nada", async () => {
      const practiceId = await practicaConGrilla();

      const respuesta = await api()
        .get(`/api/practices/${practiceId}/grid`)
        .set("Host", `${club.slug}.${BASE}`);

      expect(respuesta.status).toBe(401);
    });

    it("una práctica que no existe responde 404", async () => {
      const respuesta = await como(
        comisario,
        api().get(`/api/practices/019ff3a2-0000-0000-0000-000000000000/grid`),
      );

      expect(respuesta.status).toBe(404);
    });
  });
});
