import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { PracticeResponse } from "@polo/contracts";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { crearTokenDeSesion, hashDeTokenDeSesion } from "../../src/common/auth/session-token.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { conSesion, etiqueta } from "../db.js";

const BASE = "polo.test";

interface Cuenta {
  cuentaId: string;
  personId: string;
  token: string;
}

/** Una franja distinta por práctica: las canchas no admiten dos cosas a la misma hora. */
let siguienteFranja = 0;

describe("Prácticas · API (T-530 a T-535)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let fieldId: string;
  let admin: Cuenta;
  let comisario: Cuenta;
  let jugadores: Cuenta[];
  let estudiante: Cuenta;

  async function crearCuenta(rol: string | null): Promise<Cuenta> {
    const marca = etiqueta("pr");
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

    if (rol !== null) {
      await prisma.roleAssignment.create({
        data: {
          userAccountId: cuenta.id,
          role: rol as "club_admin",
          scope: "club",
          scopeId: club.id,
          grantedById: cuenta.id,
        },
      });
    }

    const token = crearTokenDeSesion();
    await prisma.session.create({
      data: {
        userAccountId: cuenta.id,
        tokenHash: hashDeTokenDeSesion(token),
        expiresAt: new Date(app.get<Clock>(CLOCK).now().getTime() + 86_400_000),
      },
    });

    return { cuentaId: cuenta.id, personId: persona.id, token };
  }

  function como(quien: Cuenta, peticion: request.Test): request.Test {
    return conSesion(peticion.set("Host", `${club.slug}.${BASE}`), quien.token);
  }

  function api(): request.SuperTest<request.Test> {
    return request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>;
  }

  /**
   * Una práctica en borrador, **en una franja que ningún otro test usa**.
   *
   * Cada llamada avanza una hora dentro de un día, y cambia de día cada seis. Dos cosas que costó
   * ver:
   *
   * 1. Con una franja fija los tests chocaban entre sí al publicar —«cancha ocupada»— y el síntoma
   *    aparecía tres tests más adelante, como una postulación cerrada o un puesto que no estaba.
   * 2. Las horas van **en UTC** y el horario de operación del club se mide en su zona: las 08:00
   *    UTC son las 03:00 en Bogotá, fuera de horario, y publicar fallaba. El rango 12:00–18:00 UTC
   *    cae dentro de las 06:00–18:00 del club.
   */
  async function crearPractica(extra: Record<string, unknown> = {}): Promise<PracticeResponse> {
    siguienteFranja += 1;
    const dia = 1 + Math.floor(siguienteFranja / 6);
    const hora = 12 + (siguienteFranja % 6);
    const base = `2027-03-${String(dia).padStart(2, "0")}`;
    const desde = `${base}T${String(hora).padStart(2, "0")}:00:00.000Z`;
    const hasta = `${base}T${String(hora).padStart(2, "0")}:45:00.000Z`;

    const respuesta = await como(
      admin,
      api()
        .post("/api/practices")
        .send({
          fieldId,
          startsAt: desde,
          endsAt: hasta,
          chukkers: 6,
          handicapType: "club",
          targetPlayers: 2,
          minPlayers: 2,
          applicationsCloseAt: `${base}T07:00:00.000Z`,
          decisionAt: `${base}T07:30:00.000Z`,
          ...extra,
        }),
    );

    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);

    return respuesta.body as PracticeResponse;
  }

  async function publicar(id: string): Promise<request.Response> {
    return como(admin, api().post(`/api/practices/${id}/publish`).send({}));
  }

  async function postularse(
    quien: Cuenta,
    id: string,
    cuerpo: Record<string, unknown> = {},
  ): Promise<request.Response> {
    return como(
      quien,
      api()
        .post(`/api/practices/${id}/applications`)
        .send({ chukkersOffered: 4, ...cuerpo }),
    );
  }

  async function detalle(quien: Cuenta, id: string): Promise<request.Response> {
    return como(quien, api().get(`/api/practices/${id}`));
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

    const creado = await prisma.club.create({
      data: { slug: `pra-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club de prácticas" },
    });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    fieldId = (await prisma.field.create({ data: { clubId: club.id, name: "Cancha 1" } })).id;

    admin = await crearCuenta("club_admin");
    comisario = await crearCuenta("commissioner");
    jugadores = [
      await crearCuenta("player"),
      await crearCuenta("player"),
      await crearCuenta("player"),
    ];
    estudiante = await crearCuenta("player");
    await prisma.practiceEligibility.create({
      data: {
        clubId: club.id,
        personId: estudiante.personId,
        maxHandicapHalves: 8, // hasta 4 goles
        grantedById: admin.cuentaId,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("crear y editar (T-530)", () => {
    it("el administrador crea una práctica, y nace en borrador", async () => {
      const practica = await crearPractica();

      expect(PracticeResponse.safeParse(practica).success).toBe(true);
      expect(practica.status).toBe("draft");
      expect(practica.puestosDentro).toBe(0);
    });

    it("el comisario también puede: la práctica es de los dos", async () => {
      siguienteFranja += 1;
      const respuesta = await como(
        comisario,
        api()
          .post("/api/practices")
          .send({
            fieldId,
            startsAt: "2027-05-01T15:00:00.000Z",
            endsAt: "2027-05-01T17:00:00.000Z",
            chukkers: 6,
            handicapType: "club",
            targetPlayers: 8,
            minPlayers: 6,
            applicationsCloseAt: "2027-05-01T12:00:00.000Z",
            decisionAt: "2027-05-01T13:00:00.000Z",
          }),
      );

      expect(respuesta.status).toBe(201);
    });

    it("un jugador NO puede crear prácticas", async () => {
      const respuesta = await como(
        jugadores[0] as Cuenta,
        api()
          .post("/api/practices")
          .send({
            fieldId,
            startsAt: "2027-06-01T15:00:00.000Z",
            endsAt: "2027-06-01T17:00:00.000Z",
            chukkers: 6,
            handicapType: "club",
            targetPlayers: 8,
            minPlayers: 6,
            applicationsCloseAt: "2027-06-01T12:00:00.000Z",
            decisionAt: "2027-06-01T13:00:00.000Z",
          }),
      );

      expect(respuesta.status).toBe(403);
    });

    it("un mínimo mayor que el objetivo se rechaza: nunca se podría confirmar", async () => {
      siguienteFranja += 1;
      const respuesta = await como(
        admin,
        api()
          .post("/api/practices")
          .send({
            fieldId,
            startsAt: "2027-07-01T15:00:00.000Z",
            endsAt: "2027-07-01T17:00:00.000Z",
            chukkers: 6,
            handicapType: "club",
            targetPlayers: 6,
            minPlayers: 8,
            applicationsCloseAt: "2027-07-01T12:00:00.000Z",
            decisionAt: "2027-07-01T13:00:00.000Z",
          }),
      );

      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error.code).toBe("practica_minimo_mayor_que_objetivo");
    });

    it("cerrar postulaciones después de decidir se rechaza (R-050-02)", async () => {
      const respuesta = await como(
        admin,
        api()
          .post("/api/practices")
          .send({
            fieldId,
            startsAt: "2027-08-01T15:00:00.000Z",
            endsAt: "2027-08-01T17:00:00.000Z",
            chukkers: 6,
            handicapType: "club",
            targetPlayers: 8,
            minPlayers: 6,
            applicationsCloseAt: "2027-08-01T14:00:00.000Z",
            decisionAt: "2027-08-01T13:00:00.000Z",
          }),
      );

      expect(respuesta.body.error.code).toBe("practica_cierre_despues_de_decision");
    });

    it("un borrador NO aparece en el listado de nadie (R-050-03)", async () => {
      const borrador = await crearPractica();

      const listado = await como(jugadores[0] as Cuenta, api().get("/api/practices"));

      expect(JSON.stringify(listado.body)).not.toContain(borrador.id);
    });
  });

  describe("publicar (T-531)", () => {
    it("reserva la cancha y la práctica aparece en el calendario", async () => {
      const practica = await crearPractica();
      const respuesta = await publicar(practica.id);

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.status).toBe("published");

      const reserva = await prisma.practice.findUniqueOrThrow({
        where: { id: practica.id },
        select: { fieldBookingId: true },
      });

      expect(reserva.fieldBookingId).not.toBeNull();

      const booking = await prisma.fieldBooking.findUniqueOrThrow({
        where: { id: reserva.fieldBookingId ?? "" },
      });

      expect(booking.type).toBe("practice");
      expect(booking.sourceId).toBe(practica.id);
    });

    it("sobre una franja ocupada se rechaza Y la práctica sigue en borrador", async () => {
      // Es lo que impide que exista una práctica publicada sin cancha, que es la clase de
      // inconsistencia que se descubre el día de la práctica.
      const primera = await crearPractica();
      await publicar(primera.id);

      const encima = await como(
        admin,
        api()
          .post("/api/practices")
          .send({
            fieldId,
            startsAt: primera.startsAt,
            endsAt: primera.endsAt,
            chukkers: 6,
            handicapType: "club",
            targetPlayers: 8,
            minPlayers: 6,
            applicationsCloseAt: primera.applicationsCloseAt,
            decisionAt: primera.decisionAt,
          }),
      );
      const respuesta = await publicar(encima.body.id);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("cancha_ocupada");

      const sigue = await prisma.practice.findUniqueOrThrow({ where: { id: encima.body.id } });

      expect(sigue.status).toBe("draft");
      expect(sigue.fieldBookingId).toBeNull();
    });

    it("publicar dos veces no reserva dos veces", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);
      const segunda = await publicar(practica.id);

      expect(segunda.status).toBe(409);
      expect(await prisma.fieldBooking.count({ where: { sourceId: practica.id } })).toBe(1);
    });
  });

  describe("cancelar (T-532)", () => {
    it("libera la cancha: se comprueba PROGRAMANDO otra cosa en esa franja", async () => {
      // Leer un campo no probaría nada: lo que importa es que la franja quede de verdad libre.
      const practica = await crearPractica();
      await publicar(practica.id);

      await como(
        admin,
        api().post(`/api/practices/${practica.id}/cancel`).send({ reason: "no hay caballos" }),
      );

      const otra = await como(
        admin,
        api()
          .post("/api/practices")
          .send({
            fieldId,
            startsAt: practica.startsAt,
            endsAt: practica.endsAt,
            chukkers: 6,
            handicapType: "club",
            targetPlayers: 8,
            minPlayers: 6,
            applicationsCloseAt: practica.applicationsCloseAt,
            decisionAt: practica.decisionAt,
          }),
      );

      expect((await publicar(otra.body.id)).status).toBe(201);
    });

    it("guarda el motivo", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);

      const respuesta = await como(
        admin,
        api().post(`/api/practices/${practica.id}/cancel`).send({ reason: "llovió toda la semana" }),
      );

      expect(respuesta.body.status).toBe("cancelled");
      expect(respuesta.body.cancellationReason).toBe("llovió toda la semana");
    });
  });

  describe("postularse y retirarse (T-533)", () => {
    it("un jugador se postula y queda dentro", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);

      expect((await postularse(jugadores[0] as Cuenta, practica.id)).status).toBe(204);

      const vista = await detalle(jugadores[0] as Cuenta, practica.id);

      expect(vista.body.miPostulacion).toMatchObject({ estado: "dentro", posicion: 1 });
      expect(vista.body.puestosDentro).toBe(1);
    });

    it("el tercero, con dos cupos, queda EN ESPERA y sabe en qué posición", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);

      for (const jugador of jugadores) {
        expect((await postularse(jugador, practica.id)).status).toBe(204);
      }

      const vista = await detalle(jugadores[2] as Cuenta, practica.id);

      expect(vista.body.miPostulacion).toMatchObject({ estado: "en_espera", posicion: 1 });
      expect(vista.body.puestosEnEspera).toBe(1);
    });

    it("retirarse promueve al siguiente SIN que corra nada", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);
      for (const jugador of jugadores) {
        await postularse(jugador, practica.id);
      }

      await como(
        jugadores[0] as Cuenta,
        api().delete(`/api/practices/${practica.id}/applications/mine`),
      );

      const vista = await detalle(jugadores[2] as Cuenta, practica.id);

      expect(vista.body.miPostulacion).toMatchObject({ estado: "dentro" });
    });

    it("postularse dos veces se rechaza", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);
      await postularse(jugadores[0] as Cuenta, practica.id);

      const segunda = await postularse(jugadores[0] as Cuenta, practica.id);

      expect(segunda.status).toBe(409);
      expect(segunda.body.error.code).toBe("ya_estas_postulado");
    });

    it("retirarse y volver a postularse deja a la persona AL FINAL de la fila", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);
      await postularse(jugadores[0] as Cuenta, practica.id);
      await postularse(jugadores[1] as Cuenta, practica.id);

      await como(
        jugadores[0] as Cuenta,
        api().delete(`/api/practices/${practica.id}/applications/mine`),
      );
      expect((await postularse(jugadores[0] as Cuenta, practica.id)).status).toBe(204);

      const vista = await detalle(jugadores[0] as Cuenta, practica.id);

      expect(vista.body.miPostulacion).toMatchObject({ posicion: 2 });
    });

    it("retirarse sin estar postulado se rechaza", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);

      const respuesta = await como(
        jugadores[0] as Cuenta,
        api().delete(`/api/practices/${practica.id}/applications/mine`),
      );

      expect(respuesta.body.error.code).toBe("no_estas_postulado");
    });

    it("después del cierre no se entra ni se sale (R-050-09)", async () => {
      // La práctica ya venció: su cierre está en el pasado respecto del reloj del sistema.
      const vencida = await crearPractica({
        startsAt: "2020-01-01T15:00:00.000Z",
        endsAt: "2020-01-01T17:00:00.000Z",
        applicationsCloseAt: "2020-01-01T12:00:00.000Z",
        decisionAt: "2020-01-01T13:00:00.000Z",
      });
      await publicar(vencida.id);

      const respuesta = await postularse(jugadores[0] as Cuenta, vencida.id);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("postulacion_cerrada");
    });

    it("a una práctica en borrador no se postula nadie", async () => {
      const borrador = await crearPractica();

      expect((await postularse(jugadores[0] as Cuenta, borrador.id)).status).toBe(409);
    });
  });

  describe("el estudiante y su habilitación (R-050-05)", () => {
    it("no ve en el listado las prácticas de nivel superior", async () => {
      const alta = await crearPractica({ maxLevelHalves: 12 }); // 6 goles
      await publicar(alta.id);

      const listado = await como(estudiante, api().get("/api/practices"));

      expect(JSON.stringify(listado.body)).not.toContain(alta.id);
    });

    it("y TAMPOCO entra por el enlace directo: 404, no 403", async () => {
      // Quitarlo del listado no basta: el enlace sigue funcionando. Y decir «no podés ver ésta» ya
      // revelaría que existe y de qué nivel es.
      const alta = await crearPractica({ maxLevelHalves: 12 });
      await publicar(alta.id);

      expect((await detalle(estudiante, alta.id)).status).toBe(404);
    });

    it("sí ve y se postula a una de su nivel", async () => {
      const suya = await crearPractica({ maxLevelHalves: 8 }); // 4 goles, su tope
      await publicar(suya.id);

      expect((await detalle(estudiante, suya.id)).status).toBe(200);
      expect((await postularse(estudiante, suya.id)).status).toBe(204);
    });

    it("una práctica SIN nivel declarado también le queda cerrada: falla cerrado", async () => {
      const sinNivel = await crearPractica();
      await publicar(sinNivel.id);

      expect((await detalle(estudiante, sinNivel.id)).status).toBe(404);
    });

    it("un jugador sin habilitación no está limitado por ella", async () => {
      const alta = await crearPractica({ maxLevelHalves: 12 });
      await publicar(alta.id);

      expect((await detalle(jugadores[0] as Cuenta, alta.id)).status).toBe(200);
      expect((await postularse(jugadores[0] as Cuenta, alta.id)).status).toBe(204);
    });
  });

  describe("el medio hombre (T-534)", () => {
    it("una propuesta sin aceptar NO ocupa puesto: los dos siguen sueltos", async () => {
      const practica = await crearPractica({ targetPlayers: 3, minPlayers: 2 });
      await publicar(practica.id);

      await postularse(jugadores[0] as Cuenta, practica.id, {
        halfManPartnerPersonId: jugadores[1]?.personId,
      });
      await postularse(jugadores[1] as Cuenta, practica.id);

      const vista = await detalle(jugadores[0] as Cuenta, practica.id);

      expect(vista.body.puestosDentro).toBe(2);
      expect(vista.body.miPostulacion.medioHombre).toMatchObject({ aceptada: false });
    });

    it("aceptada, los dos ocupan UNO", async () => {
      const practica = await crearPractica({ targetPlayers: 3, minPlayers: 2 });
      await publicar(practica.id);

      await postularse(jugadores[0] as Cuenta, practica.id, {
        halfManPartnerPersonId: jugadores[1]?.personId,
      });
      await postularse(jugadores[1] as Cuenta, practica.id);

      const aceptada = await como(
        jugadores[1] as Cuenta,
        api()
          .post(`/api/practices/${practica.id}/applications/mine/accept-partner`)
          .send({ companeroPersonId: jugadores[0]?.personId }),
      );

      expect(aceptada.status).toBe(204);

      const vista = await detalle(jugadores[0] as Cuenta, practica.id);

      expect(vista.body.puestosDentro).toBe(1);
      expect(vista.body.miPostulacion.medioHombre).toMatchObject({ aceptada: true });
    });

    it("quien recibe una propuesta la VE, que es lo que la hace aceptable", async () => {
      // El compañero sólo aparece en `postulados` cuando la pareja **ya está formada**, así que sin
      // este campo una propuesta pendiente era invisible y el endpoint de aceptarla no se podía
      // alcanzar desde ninguna pantalla. Lo destapó abrir la pantalla en un navegador de verdad.
      const practica = await crearPractica({ targetPlayers: 3, minPlayers: 2 });
      await publicar(practica.id);

      await postularse(jugadores[0] as Cuenta, practica.id, {
        halfManPartnerPersonId: jugadores[1]?.personId,
      });
      await postularse(jugadores[1] as Cuenta, practica.id);

      const quienRecibe = await detalle(jugadores[1] as Cuenta, practica.id);
      const quienPropuso = await detalle(jugadores[0] as Cuenta, practica.id);

      expect(quienRecibe.body.miPostulacion.propuestaRecibida).toMatchObject({
        personId: jugadores[0]?.personId,
      });
      // Y quien propuso no ve una propuesta recibida: la suya es la que espera respuesta.
      expect(quienPropuso.body.miPostulacion.propuestaRecibida).toBeNull();
    });

    it("nadie ve una propuesta de sí mismo", async () => {
      // El bug que apareció en el navegador: comparar dos nulos daba verdadero y la pantalla decía
      // «te propusiste compartir puesto» sobre uno mismo.
      const practica = await crearPractica();
      await publicar(practica.id);
      await postularse(jugadores[0] as Cuenta, practica.id);

      const vista = await detalle(jugadores[0] as Cuenta, practica.id);

      expect(vista.body.miPostulacion.propuestaRecibida).toBeNull();
    });

    it("aceptar una propuesta que nadie hizo se rechaza", async () => {
      // Sin esta comprobación, cualquiera podría emparejarse con quien quisiera con sólo escribir
      // su identificador.
      const practica = await crearPractica();
      await publicar(practica.id);
      await postularse(jugadores[0] as Cuenta, practica.id);
      await postularse(jugadores[1] as Cuenta, practica.id);

      const respuesta = await como(
        jugadores[1] as Cuenta,
        api()
          .post(`/api/practices/${practica.id}/applications/mine/accept-partner`)
          .send({ companeroPersonId: jugadores[0]?.personId }),
      );

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("pareja_no_valida");
    });

    it("si uno de la pareja se retira, el otro queda suelto en su posición", async () => {
      const practica = await crearPractica({ targetPlayers: 3, minPlayers: 2 });
      await publicar(practica.id);

      await postularse(jugadores[0] as Cuenta, practica.id, {
        halfManPartnerPersonId: jugadores[1]?.personId,
      });
      await postularse(jugadores[1] as Cuenta, practica.id);
      await como(
        jugadores[1] as Cuenta,
        api()
          .post(`/api/practices/${practica.id}/applications/mine/accept-partner`)
          .send({ companeroPersonId: jugadores[0]?.personId }),
      );

      await como(
        jugadores[1] as Cuenta,
        api().delete(`/api/practices/${practica.id}/applications/mine`),
      );

      const vista = await detalle(jugadores[0] as Cuenta, practica.id);

      expect(vista.body.puestosDentro).toBe(1);
      expect(vista.body.miPostulacion).toMatchObject({ estado: "dentro", posicion: 1 });
    });
  });

  describe("el detalle y el aislamiento (T-535)", () => {
    it("dos personas ven la misma práctica con su propio lugar", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);
      await postularse(jugadores[0] as Cuenta, practica.id);
      await postularse(jugadores[1] as Cuenta, practica.id);
      await postularse(jugadores[2] as Cuenta, practica.id);

      const primera = await detalle(jugadores[0] as Cuenta, practica.id);
      const tercera = await detalle(jugadores[2] as Cuenta, practica.id);

      expect(primera.body.miPostulacion.estado).toBe("dentro");
      expect(tercera.body.miPostulacion.estado).toBe("en_espera");
      expect(primera.body.puestosDentro).toBe(tercera.body.puestosDentro);
    });

    it("quien no se postuló no tiene postulación, pero sí ve quiénes van", async () => {
      const practica = await crearPractica();
      await publicar(practica.id);
      await postularse(jugadores[0] as Cuenta, practica.id);

      const vista = await detalle(jugadores[1] as Cuenta, practica.id);

      expect(vista.body.miPostulacion).toBeNull();
      expect(vista.body.postulados).toHaveLength(1);
    });

    it("una práctica de otro club responde 404 (P-05)", async () => {
      const otroClub = await prisma.club.create({
        data: { slug: `aje-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club ajeno" },
      });
      const canchaAjena = await prisma.field.create({
        data: { clubId: otroClub.id, name: "Cancha ajena" },
      });
      const ajena = await prisma.practice.create({
        data: {
          clubId: otroClub.id,
          fieldId: canchaAjena.id,
          startsAt: new Date("2027-09-01T15:00:00Z"),
          endsAt: new Date("2027-09-01T17:00:00Z"),
          chukkers: 6,
          handicapType: "club",
          targetPlayers: 8,
          minPlayers: 6,
          applicationsCloseAt: new Date("2027-09-01T12:00:00Z"),
          decisionAt: new Date("2027-09-01T13:00:00Z"),
          status: "published",
          createdById: admin.cuentaId,
        },
      });

      expect((await detalle(admin, ajena.id)).status).toBe(404);
      expect((await postularse(jugadores[0] as Cuenta, ajena.id)).status).toBe(404);
    });

    it("sin sesión no se ve nada", async () => {
      const respuesta = await api().get("/api/practices").set("Host", `${club.slug}.${BASE}`);

      expect(respuesta.status).toBe(401);
    });
  });
});
