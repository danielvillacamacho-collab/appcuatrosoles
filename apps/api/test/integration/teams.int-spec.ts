import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { PracticeTeamsResponse } from "@polo/contracts";
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
  private instante = new Date("2026-03-01T12:00:00Z");

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
  startsAt: "2026-03-10T16:00:00.000Z",
  endsAt: "2026-03-10T17:30:00.000Z",
  closeAt: "2026-03-10T14:00:00.000Z",
  decisionAt: "2026-03-10T15:00:00.000Z",
};

describe("Equipos · API (T-620 a T-624)", () => {
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
    const marca = etiqueta("eq");
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
    const base = `2026-03-${String(dia).padStart(2, "0")}`;

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
      data: { slug: `eqa-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club de equipos" },
    });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    fieldId = (await prisma.field.create({ data: { clubId: club.id, name: "Cancha 1" } })).id;

    comisario = await crearCuenta("commissioner");
    // Handicaps elegidos para que exista un reparto perfecto: 8+4 = 6+6.
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

  describe("la propuesta al confirmarse (T-621)", () => {
    it("una práctica confirmada queda con equipos SIN que nadie haga nada", async () => {
      const practiceId = await practicaConfirmada(jugadores);

      const respuesta = await como(comisario, api().get(`/api/practices/${practiceId}/teams`));

      expect(respuesta.status).toBe(200);
      expect(PracticeTeamsResponse.safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body.equipos).toHaveLength(2);
      expect(respuesta.body.aprobados).toBe(false);
    });

    it("y el reparto es el más parejo: 8+4 contra 6+6", async () => {
      const practiceId = await practicaConfirmada(jugadores);

      const respuesta = await como(comisario, api().get(`/api/practices/${practiceId}/teams`));

      expect(respuesta.body.diferenciaHalves).toBe(0);
    });

    it("una práctica CANCELADA no tiene equipos", async () => {
      // R-051-01. El proceso cancela porque no se alcanza el mínimo.
      siguienteFranja += 1;
      const reserva = await prisma.fieldBooking.create({
        data: {
          clubId: club.id,
          fieldId,
          startsAt: new Date("2026-03-20T12:00:00.000Z"),
          endsAt: new Date("2026-03-20T12:45:00.000Z"),
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
          targetPlayers: 8,
          minPlayers: 8,
          applicationsCloseAt: new Date(CUANDO.closeAt),
          decisionAt: new Date(CUANDO.decisionAt),
          status: "published",
          fieldBookingId: reserva.id,
          createdById: comisario.cuentaId,
        },
        select: { id: true },
      });

      reloj.mover(CUANDO.decisionAt);
      await proceso.decidirVencidas();

      const respuesta = await como(comisario, api().get(`/api/practices/${practica.id}/teams`));

      expect(respuesta.status).toBe(404);
    });
  });

  describe("proponer de nuevo (T-620)", () => {
    it("rearmar no duplica equipos ni puestos", async () => {
      const practiceId = await practicaConfirmada(jugadores);

      await como(comisario, api().post(`/api/practices/${practiceId}/teams/propose`).send({}));
      await como(comisario, api().post(`/api/practices/${practiceId}/teams/propose`).send({}));

      const equipos = await prisma.practiceTeam.count({ where: { practiceId } });
      const puestos = await prisma.practiceSlot.count({
        where: { team: { practiceId } },
      });

      expect(equipos).toBe(2);
      expect(puestos).toBe(4);
    });

    it("el handicap queda CONGELADO: cambiarlo después no mueve los equipos", async () => {
      // R-051-09. Es lo que `specs/030` promete al no tener fechas de vigencia.
      const practiceId = await practicaConfirmada(jugadores);
      const antes = await prisma.practiceSlot.findMany({
        where: { team: { practiceId }, primaryPersonId: jugadores[0]?.personId ?? "" },
        select: { effectiveHandicapHalves: true },
      });

      await prisma.playerHandicap.update({
        where: { personId_type: { personId: jugadores[0]?.personId ?? "", type: "club" } },
        data: { valueHalves: 20 },
      });

      const despues = await prisma.practiceSlot.findMany({
        where: { team: { practiceId }, primaryPersonId: jugadores[0]?.personId ?? "" },
        select: { effectiveHandicapHalves: true },
      });

      expect(despues[0]?.effectiveHandicapHalves).toBe(antes[0]?.effectiveHandicapHalves);

      // Y se restaura para no ensuciar los demás tests.
      await prisma.playerHandicap.update({
        where: { personId_type: { personId: jugadores[0]?.personId ?? "", type: "club" } },
        data: { valueHalves: 8 },
      });
    });
  });

  describe("ajustar y aprobar (T-622)", () => {
    it("mover un jugador cambia las sumas de los dos equipos", async () => {
      const practiceId = await practicaConfirmada(jugadores);
      const actuales = (await como(comisario, api().get(`/api/practices/${practiceId}/teams`))).body;
      const [a, b] = actuales.equipos;

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/teams`)
          .send({
            equipos: [
              { label: "A", slotIds: [...a.slots.map((s: { id: string }) => s.id), b.slots[0].id] },
              { label: "B", slotIds: b.slots.slice(1).map((s: { id: string }) => s.id) },
            ],
          }),
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.equipos[0].slots).toHaveLength(3);
      expect(respuesta.body.equipos[1].slots).toHaveLength(1);
      expect(respuesta.body.diferenciaHalves).toBeGreaterThan(0);
    });

    it("un ajuste que deja gente afuera se rechaza", async () => {
      // Sin esto, alguien podría desaparecer de los dos equipos y nadie se enteraría hasta la cancha.
      const practiceId = await practicaConfirmada(jugadores);
      const actuales = (await como(comisario, api().get(`/api/practices/${practiceId}/teams`))).body;

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/teams`)
          .send({
            equipos: [
              { label: "A", slotIds: [actuales.equipos[0].slots[0].id] },
              { label: "B", slotIds: [] },
            ],
          }),
      );

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe("equipos_incompletos");
    });

    it("aprobar publica y avisa a cada jugador", async () => {
      const practiceId = await practicaConfirmada(jugadores);

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/teams/approve`).send({}),
      );

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.aprobados).toBe(true);

      const avisos = await prisma.outboxMessage.findMany({
        where: { type: "practice.teams-published" },
        select: { payload: true },
      });

      expect(
        avisos.filter((aviso) => JSON.stringify(aviso.payload).includes(practiceId)),
      ).toHaveLength(4);
    });

    it("reacomodar después de aprobado SE PUEDE, y vuelve a avisar", async () => {
      // Una práctica se reacomoda hasta último momento; la plataforma no puede ser más rígida que
      // la cancha (R-051-07).
      const practiceId = await practicaConfirmada(jugadores);
      await como(comisario, api().post(`/api/practices/${practiceId}/teams/approve`).send({}));

      const segunda = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/teams/approve`).send({}),
      );

      expect(segunda.status).toBe(201);

      const avisos = await prisma.outboxMessage.count({
        where: { type: "practice.teams-published" },
      });

      expect(avisos).toBeGreaterThan(4);
    });

    it("un jugador NO puede aprobar", async () => {
      const practiceId = await practicaConfirmada(jugadores);

      const respuesta = await como(
        jugadores[0] as Cuenta,
        api().post(`/api/practices/${practiceId}/teams/approve`).send({}),
      );

      expect(respuesta.status).toBe(403);
    });
  });

  describe("quién ve qué (T-623, R-051-05)", () => {
    it("un jugador NO ve una propuesta sin aprobar, y la respuesta no filtra ningún nombre", async () => {
      // **El criterio de `specs/040` T-451**: se serializa la respuesta completa. Que el campo
      // venga vacío no alcanza — el día que alguien agregue un dato, un test que mire campos
      // conocidos no lo vería.
      const practiceId = await practicaConfirmada(jugadores);

      const respuesta = await como(
        jugadores[0] as Cuenta,
        api().get(`/api/practices/${practiceId}/teams`),
      );

      expect(respuesta.status).toBe(404);

      const comoTexto = JSON.stringify(respuesta.body);

      for (const quien of jugadores) {
        expect(comoTexto, `la respuesta filtró a ${quien.personId}`).not.toContain(quien.personId);
      }
    });

    it("aprobados, sí los ve", async () => {
      const practiceId = await practicaConfirmada(jugadores);
      await como(comisario, api().post(`/api/practices/${practiceId}/teams/approve`).send({}));

      const respuesta = await como(
        jugadores[0] as Cuenta,
        api().get(`/api/practices/${practiceId}/teams`),
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.aprobados).toBe(true);
      expect(JSON.stringify(respuesta.body)).toContain(jugadores[0]?.personId);
    });

    it("una práctica de otro club responde 404", async () => {
      const otroClub = await prisma.club.create({
        data: { slug: `aj-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Ajeno" },
      });
      const canchaAjena = await prisma.field.create({
        data: { clubId: otroClub.id, name: "Cancha ajena" },
      });
      const ajena = await prisma.practice.create({
        data: {
          clubId: otroClub.id,
          fieldId: canchaAjena.id,
          startsAt: new Date(CUANDO.startsAt),
          endsAt: new Date(CUANDO.endsAt),
          chukkers: 6,
          handicapType: "club",
          targetPlayers: 4,
          minPlayers: 1,
          applicationsCloseAt: new Date(CUANDO.closeAt),
          decisionAt: new Date(CUANDO.decisionAt),
          status: "confirmed",
          createdById: comisario.cuentaId,
        },
        select: { id: true },
      });

      const respuesta = await como(comisario, api().get(`/api/practices/${ajena.id}/teams`));

      expect(respuesta.status).toBe(404);
    });
  });

  describe("el medio hombre pesa el más alto (HU-051-03)", () => {
    it("un puesto compartido guarda a los dos y pesa el mayor", async () => {
      const uno = await crearCuenta("player", 4);
      const otro = await crearCuenta("player", 12);
      const practiceId = await practicaConfirmadaConPareja(uno, otro);

      const puestos = await prisma.practiceSlot.findMany({
        where: { team: { practiceId }, secondaryPersonId: { not: null } },
      });

      expect(puestos).toHaveLength(1);
      expect(puestos[0]?.effectiveHandicapHalves).toBe(12);
    });

    async function practicaConfirmadaConPareja(uno: Cuenta, otro: Cuenta): Promise<string> {
      siguienteFranja += 1;
      const reserva = await prisma.fieldBooking.create({
        data: {
          clubId: club.id,
          fieldId,
          startsAt: new Date("2026-03-25T13:00:00.000Z"),
          endsAt: new Date("2026-03-25T13:45:00.000Z"),
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
          targetPlayers: 2,
          minPlayers: 1,
          applicationsCloseAt: new Date(CUANDO.closeAt),
          decisionAt: new Date(CUANDO.decisionAt),
          status: "published",
          fieldBookingId: reserva.id,
          createdById: comisario.cuentaId,
        },
        select: { id: true },
      });

      await prisma.practiceApplication.create({
        data: {
          clubId: club.id,
          practiceId: practica.id,
          personId: uno.personId,
          chukkersOffered: 3,
          halfManPartnerPersonId: otro.personId,
        },
      });
      await prisma.practiceApplication.create({
        data: {
          clubId: club.id,
          practiceId: practica.id,
          personId: otro.personId,
          chukkersOffered: 3,
          halfManPartnerPersonId: uno.personId,
        },
      });

      reloj.mover(CUANDO.decisionAt);
      await proceso.decidirVencidas();

      return practica.id;
    }
  });
});
