import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
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

  describe("corregir la grilla (T-723)", () => {
    /** Dónde está una persona en un chukker dado. */
    async function lugarDe(
      practiceId: string,
      personId: string,
      chukker: number,
    ): Promise<{ equipo: "A" | "B"; position: number }> {
      const celda = await prisma.chukkerGridCell.findFirstOrThrow({
        where: { practiceId, personId, chukkerNo: chukker },
        select: { team: true, position: true },
      });

      return { equipo: celda.team, position: celda.position };
    }

    it("vaciar una celda baja la cuenta de esa persona", async () => {
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;
      const donde = await lugarDe(practiceId, ana, 4);

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({ cambios: [{ chukker: 4, ...donde, personId: null }] }),
      );

      expect(respuesta.status).toBe(200);
      const grilla = PracticeGridResponse.parse(respuesta.body);
      const fila = grilla.chukkersPorPersona.find((una) => una.personId === ana);
      expect(fila?.chukkers).toBe(5);
    });

    it("INTERCAMBIAR dos jugadores del mismo chukker funciona", async () => {
      // El caso que falla con una sola pasada: poner a Ana donde está Luis choca contra el `UNIQUE`
      // antes de que Luis se mueva. Es el mismo escalón de `051` T-632.
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;
      const luis = (jugadores[3] as Cuenta).personId;
      const deAna = await lugarDe(practiceId, ana, 3);
      const deLuis = await lugarDe(practiceId, luis, 3);

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({
            cambios: [
              { chukker: 3, ...deAna, personId: luis },
              { chukker: 3, ...deLuis, personId: ana },
            ],
          }),
      );

      expect(respuesta.status).toBe(200);
      expect(await lugarDe(practiceId, ana, 3)).toEqual(deLuis);
      expect(await lugarDe(practiceId, luis, 3)).toEqual(deAna);
    });

    it("un lote con un cambio inválido NO aplica ninguno", async () => {
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;
      const deAna = await lugarDe(practiceId, ana, 2);

      // El primero es válido —vaciar la celda de Ana en el chukker 2—; el segundo la dejaría dos
      // veces en el chukker 1, donde sigue estando.
      const enElUno = await lugarDe(practiceId, (jugadores[3] as Cuenta).personId, 1);

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({
            cambios: [
              { chukker: 2, ...deAna, personId: null },
              { chukker: 1, ...enElUno, personId: ana },
            ],
          }),
      );

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe("repetido_en_el_chukker");

      // El primer cambio, que era válido, tampoco entró.
      expect(await lugarDe(practiceId, ana, 2)).toEqual(deAna);
    });

    it("la misma persona dos veces en un chukker se rechaza, y el error dice cuál", async () => {
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;
      const deLuis = await lugarDe(practiceId, (jugadores[3] as Cuenta).personId, 5);

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({ cambios: [{ chukker: 5, ...deLuis, personId: ana }] }),
      );

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.message).toContain("5");
    });

    it("se puede meter a alguien que NO se postuló (R-052-05)", async () => {
      // Es lo normal cuando falta uno. Una grilla que no lo permita se llena mal o no se llena.
      const practiceId = await practicaConGrilla();
      const suplente = await prisma.person.create({
        data: { clubId: club.id, fullName: `Suplente ${etiqueta("s")}` },
      });
      const deAna = await lugarDe(practiceId, (jugadores[0] as Cuenta).personId, 6);

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({ cambios: [{ chukker: 6, ...deAna, personId: suplente.id }] }),
      );

      expect(respuesta.status).toBe(200);
      const grilla = PracticeGridResponse.parse(respuesta.body);
      expect(grilla.chukkersPorPersona.some((fila) => fila.personId === suplente.id)).toBe(true);
    });

    it("una persona de OTRO club se rechaza", async () => {
      const otroClub = await prisma.club.create({
        data: { slug: `aj2-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Otro" },
      });
      const ajena = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Persona ajena" },
      });
      const practiceId = await practicaConGrilla();
      const deAna = await lugarDe(practiceId, (jugadores[0] as Cuenta).personId, 1);

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({ cambios: [{ chukker: 1, ...deAna, personId: ajena.id }] }),
      );

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe("persona_invalida");
    });

    it("un lugar que no existe en la grilla se rechaza", async () => {
      const practiceId = await practicaConGrilla();

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({
            cambios: [{ chukker: 99, equipo: "A", position: 1, personId: null }],
          }),
      );

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe("celda_inexistente");
    });

    it("un jugador NO puede corregir la grilla", async () => {
      const practiceId = await practicaConGrilla();
      const deAna = await lugarDe(practiceId, (jugadores[0] as Cuenta).personId, 1);

      const respuesta = await como(
        jugadores[1] as Cuenta,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({ cambios: [{ chukker: 1, ...deAna, personId: null }] }),
      );

      expect(respuesta.status).toBe(403);
    });

    it("el comisario de OTRO club tampoco corrige la grilla ajena: 404", async () => {
      const otroClub = await prisma.club.create({
        data: { slug: `aj3-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Otro más" },
      });
      app.get(ClubDirectory).invalidate();

      const persona = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Comisario ajeno 2" },
      });
      const cuenta = await prisma.userAccount.create({
        data: {
          personId: persona.id,
          email: `${etiqueta("aj3")}@ejemplo.test`,
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
      const deAna = await lugarDe(practiceId, (jugadores[0] as Cuenta).personId, 1);

      const respuesta = await conSesion(
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .set("Host", `${otroClub.slug}.${BASE}`)
          .send({ cambios: [{ chukker: 1, ...deAna, personId: null }] }),
        token,
      );

      expect(respuesta.status).toBe(404);
    });
  });

  describe("quién no llegó (T-724)", () => {
    async function celdasDe(practiceId: string, personId: string): Promise<number> {
      return prisma.chukkerGridCell.count({ where: { practiceId, personId } });
    }

    it("marcar ausente vacía TODAS sus celdas de una vez", async () => {
      // La conveniencia entera de HU-052-04: un toque en vez de seis.
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;

      expect(await celdasDe(practiceId, ana)).toBe(6);

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/grid/no-show`).send({ personId: ana, ausente: true }),
      );

      expect(respuesta.status).toBe(201);
      expect(await celdasDe(practiceId, ana)).toBe(0);

      const postulacion = await prisma.practiceApplication.findFirstOrThrow({
        where: { practiceId, personId: ana },
        select: { outcome: true },
      });
      expect(postulacion.outcome).toBe("no_show");
    });

    it("el ausente aparece en la cuenta, en cero y marcado", async () => {
      // «No jugó» es un dato que alguien tiene que poder ver. Sin esto desaparecería de la pantalla.
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/grid/no-show`).send({ personId: ana, ausente: true }),
      );

      const grilla = PracticeGridResponse.parse(respuesta.body);
      const fila = grilla.chukkersPorPersona.find((una) => una.personId === ana);

      expect(fila?.chukkers).toBe(0);
      expect(fila?.noSePresento).toBe(true);
    });

    it("estando marcado NO se le puede poner en una celda: la otra dirección de la invariante", async () => {
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;
      await como(
        comisario,
        api().post(`/api/practices/${practiceId}/grid/no-show`).send({ personId: ana, ausente: true }),
      );

      const hueco = await prisma.chukkerGridCell.findFirstOrThrow({
        where: { practiceId, personId: null },
        select: { chukkerNo: true, team: true, position: true },
      });

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({
            cambios: [
              {
                chukker: hueco.chukkerNo,
                equipo: hueco.team,
                position: hueco.position,
                personId: ana,
              },
            ],
          }),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("marcado_ausente");
    });

    it("desmarcar lo devuelve a aceptado, y NO le restaura las celdas", async () => {
      // El sistema no sabe qué chukkers jugó. Devolverle los seis sería inventar el dato.
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;
      await como(
        comisario,
        api().post(`/api/practices/${practiceId}/grid/no-show`).send({ personId: ana, ausente: true }),
      );

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/grid/no-show`).send({ personId: ana, ausente: false }),
      );

      expect(respuesta.status).toBe(201);
      expect(await celdasDe(practiceId, ana)).toBe(0);

      const postulacion = await prisma.practiceApplication.findFirstOrThrow({
        where: { practiceId, personId: ana },
        select: { outcome: true },
      });
      expect(postulacion.outcome).toBe("accepted");
    });

    it("desmarcado, se le puede volver a poner en la grilla", async () => {
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;
      await como(
        comisario,
        api().post(`/api/practices/${practiceId}/grid/no-show`).send({ personId: ana, ausente: true }),
      );
      await como(
        comisario,
        api().post(`/api/practices/${practiceId}/grid/no-show`).send({ personId: ana, ausente: false }),
      );

      const hueco = await prisma.chukkerGridCell.findFirstOrThrow({
        where: { practiceId, personId: null },
        select: { chukkerNo: true, team: true, position: true },
      });

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({
            cambios: [
              {
                chukker: hueco.chukkerNo,
                equipo: hueco.team,
                position: hueco.position,
                personId: ana,
              },
            ],
          }),
      );

      expect(respuesta.status).toBe(200);
    });

    it("alguien que NO estaba aceptado no se puede marcar", async () => {
      const practiceId = await practicaConGrilla();
      const ajeno = await prisma.person.create({
        data: { clubId: club.id, fullName: `Nunca postulado ${etiqueta("n")}` },
      });

      const respuesta = await como(
        comisario,
        api()
          .post(`/api/practices/${practiceId}/grid/no-show`)
          .send({ personId: ajeno.id, ausente: true }),
      );

      expect(respuesta.status).toBe(404);
    });

    it("desmarcar a quien no estaba marcado se rechaza", async () => {
      const practiceId = await practicaConGrilla();
      const ana = (jugadores[0] as Cuenta).personId;

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/grid/no-show`).send({ personId: ana, ausente: false }),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("no_estaba_marcado");
    });

    it("un jugador NO puede marcar ausentes", async () => {
      const practiceId = await practicaConGrilla();

      const respuesta = await como(
        jugadores[1] as Cuenta,
        api()
          .post(`/api/practices/${practiceId}/grid/no-show`)
          .send({ personId: (jugadores[0] as Cuenta).personId, ausente: true }),
      );

      expect(respuesta.status).toBe(403);
    });
  });

  describe("cerrar y reabrir (T-725)", () => {
    /** Después de que la práctica empezó, que es cuando se puede cerrar. */
    function despuesDeEmpezar(): void {
      reloj.mover("2026-05-10T18:00:00.000Z");
    }

    it("cerrar deja la práctica en played, con quién y cuándo", async () => {
      const practiceId = await practicaConGrilla();
      despuesDeEmpezar();

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/close`).send({}),
      );

      expect(respuesta.status).toBe(201);
      expect(PracticeGridResponse.parse(respuesta.body).cerrada).toBe(true);

      const practica = await prisma.practice.findUniqueOrThrow({
        where: { id: practiceId },
        select: { status: true, closedAt: true, closedById: true },
      });

      expect(practica.status).toBe("played");
      expect(practica.closedAt).not.toBeNull();
      expect(practica.closedById).toBe(comisario.cuentaId);
    });

    it("cerrada, la grilla NO admite cambios", async () => {
      const practiceId = await practicaConGrilla();
      const celda = await prisma.chukkerGridCell.findFirstOrThrow({
        where: { practiceId },
        select: { chukkerNo: true, team: true, position: true },
      });
      despuesDeEmpezar();
      await como(comisario, api().post(`/api/practices/${practiceId}/close`).send({}));

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({
            cambios: [
              {
                chukker: celda.chukkerNo,
                equipo: celda.team,
                position: celda.position,
                personId: null,
              },
            ],
          }),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("practica_cerrada");
    });

    it("una práctica que TODAVÍA NO EMPEZÓ no se cierra (R-052-07)", async () => {
      const practiceId = await practicaConGrilla();
      reloj.mover("2026-05-10T12:00:00.000Z");

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/close`).send({}),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("todavia_no_empezo");
    });

    it("cerrar dos veces se rechaza con su propio motivo", async () => {
      const practiceId = await practicaConGrilla();
      despuesDeEmpezar();
      await como(comisario, api().post(`/api/practices/${practiceId}/close`).send({}));

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/close`).send({}),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("ya_cerrada");
    });

    it("reabrir la devuelve a editable, y DEJA RASTRO EN LA AUDITORÍA", async () => {
      const practiceId = await practicaConGrilla();
      despuesDeEmpezar();
      await como(comisario, api().post(`/api/practices/${practiceId}/close`).send({}));

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/reopen`).send({}),
      );

      expect(respuesta.status).toBe(201);
      expect(PracticeGridResponse.parse(respuesta.body).cerrada).toBe(false);

      const practica = await prisma.practice.findUniqueOrThrow({
        where: { id: practiceId },
        select: { status: true, closedAt: true, closedById: true },
      });
      expect(practica.status).toBe("confirmed");
      expect(practica.closedAt).toBeNull();
      expect(practica.closedById).toBeNull();

      // La mitad de la razón por la que reabrir puede existir: si el rastro se perdiera, cerrar
      // dejaría de significar algo. `audit_log` es append-only, así que es el único sitio seguro.
      const rastro = await prisma.auditLog.findMany({
        where: { entityId: practiceId, action: "practice.reopened" },
        select: { actorUserId: true },
      });

      expect(rastro).toHaveLength(1);
      expect(rastro[0]?.actorUserId).toBe(comisario.cuentaId);
    });

    it("reabierta, la grilla vuelve a admitir cambios", async () => {
      const practiceId = await practicaConGrilla();
      const celda = await prisma.chukkerGridCell.findFirstOrThrow({
        where: { practiceId },
        select: { chukkerNo: true, team: true, position: true },
      });
      despuesDeEmpezar();
      await como(comisario, api().post(`/api/practices/${practiceId}/close`).send({}));
      await como(comisario, api().post(`/api/practices/${practiceId}/reopen`).send({}));

      const respuesta = await como(
        comisario,
        api()
          .patch(`/api/practices/${practiceId}/grid`)
          .send({
            cambios: [
              {
                chukker: celda.chukkerNo,
                equipo: celda.team,
                position: celda.position,
                personId: null,
              },
            ],
          }),
      );

      expect(respuesta.status).toBe(200);
    });

    it("reabrir algo que no está cerrado se rechaza", async () => {
      const practiceId = await practicaConGrilla();

      const respuesta = await como(
        comisario,
        api().post(`/api/practices/${practiceId}/reopen`).send({}),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("practica_no_cerrada");
    });

    it("un jugador NO puede cerrar ni reabrir", async () => {
      const practiceId = await practicaConGrilla();
      despuesDeEmpezar();

      const cerrar = await como(
        jugadores[1] as Cuenta,
        api().post(`/api/practices/${practiceId}/close`).send({}),
      );
      expect(cerrar.status).toBe(403);

      await como(comisario, api().post(`/api/practices/${practiceId}/close`).send({}));

      const reabrir = await como(
        jugadores[1] as Cuenta,
        api().post(`/api/practices/${practiceId}/reopen`).send({}),
      );
      expect(reabrir.status).toBe(403);
    });

    it("el comisario de OTRO club no cierra la práctica ajena: 404", async () => {
      const otroClub = await prisma.club.create({
        data: { slug: `aj4-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Otro cuarto" },
      });
      app.get(ClubDirectory).invalidate();

      const persona = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Comisario ajeno 3" },
      });
      const cuenta = await prisma.userAccount.create({
        data: {
          personId: persona.id,
          email: `${etiqueta("aj4")}@ejemplo.test`,
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
      despuesDeEmpezar();

      const respuesta = await conSesion(
        api()
          .post(`/api/practices/${practiceId}/close`)
          .set("Host", `${otroClub.slug}.${BASE}`)
          .send({}),
        token,
      );

      expect(respuesta.status).toBe(404);
    });
  });

  describe("la grilla no se cuela en los listados (T-727)", () => {
    it("el listado de prácticas NO trae celdas, ni una", async () => {
      // El presupuesto de la interfaz (ADR-014). Con 48 celdas por práctica embebidas, un listado
      // de una temporada lo revienta solo. Es el criterio de `specs/040` T-451: se serializa la
      // respuesta ENTERA y se busca dentro, en vez de comprobar campo por campo — así también falla
      // el día que alguien agregue la grilla anidada bajo otro nombre.
      const practiceId = await practicaConGrilla();

      const respuesta = await como(comisario, api().get(`/api/practices`));

      expect(respuesta.status).toBe(200);
      const crudo = JSON.stringify(respuesta.body);

      expect(crudo).toContain(practiceId);
      expect(crudo).not.toContain("chukkerNo");
      expect(crudo).not.toContain("celdas");
      expect(crudo).not.toContain("chukkersPorPersona");
    });

    it("el detalle de una práctica tampoco la trae", async () => {
      const practiceId = await practicaConGrilla();

      const respuesta = await como(comisario, api().get(`/api/practices/${practiceId}`));

      expect(respuesta.status).toBe(200);
      const crudo = JSON.stringify(respuesta.body);

      expect(crudo).not.toContain("celdas");
      expect(crudo).not.toContain("chukkersPorPersona");
    });
  });
});
