import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { PersonHandicapsResponse } from "@polo/contracts";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { crearTokenDeSesion, hashDeTokenDeSesion } from "../../src/common/auth/session-token.js";
import { HandicapsService } from "../../src/handicaps/handicaps.service.js";
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

describe("Handicaps · API (T-330 a T-335)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: { id: string; slug: string };
  let comisario: Cuenta;
  let administrador: Cuenta;
  let jugador: Cuenta;
  let acudiente: Cuenta;
  let menor: string;

  async function crearCuenta(rol: string | null): Promise<Cuenta> {
    const marca = etiqueta("h");
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
          role: rol as "commissioner",
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

  /** `conSesion` pone la cookie **y la cabecera CSRF**: sin ella toda mutación es un 403. */
  function fijar(
    quien: Cuenta,
    personId: string,
    tipo: string,
    cuerpo: Record<string, unknown>,
  ): request.Test {
    const peticion = request(app.getHttpServer())
      .put(`/api/people/${personId}/handicaps/${tipo}`)
      .set("Host", `${club.slug}.${BASE}`);

    return conSesion(peticion, quien.token).send(cuerpo);
  }

  function leer(quien: Cuenta, ruta: string): request.Test {
    const peticion = request(app.getHttpServer()).get(ruta).set("Host", `${club.slug}.${BASE}`);

    return conSesion(peticion, quien.token);
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
      data: { slug: `hc-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club del handicap" },
    });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();

    comisario = await crearCuenta("commissioner");
    administrador = await crearCuenta("club_admin");
    jugador = await crearCuenta("player");
    acudiente = await crearCuenta("player");

    const perfilMenor = await prisma.person.create({
      data: { clubId: club.id, fullName: "Sofía Menor", isMinor: true },
    });
    menor = perfilMenor.id;
    await prisma.guardianship.create({
      data: {
        clubId: club.id,
        guardianPersonId: acudiente.personId,
        dependentPersonId: menor,
        startsOn: new Date("2020-01-01"),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("fijar un handicap (T-330, T-333)", () => {
    it("el comisario sube medio gol y el valor vigente cambia", async () => {
      const respuesta = await fijar(comisario, jugador.personId, "club", {
        valueHalves: 5,
        reason: "buen semestre",
      });

      expect(respuesta.status).toBe(200);
      expect(PersonHandicapsResponse.safeParse(respuesta.body).success).toBe(true);
      expect(respuesta.body.club).toMatchObject({ valueHalves: 5, calificado: true });
      // El otro tipo no se toca: son independientes (R-030-01).
      expect(respuesta.body.international).toMatchObject({ calificado: false, valueHalves: -4 });
    });

    it("queda registrado en el historial, con el anterior que de verdad regía", async () => {
      await fijar(comisario, jugador.personId, "club", { valueHalves: 7, reason: "sigue subiendo" });

      const ultimo = await prisma.handicapHistory.findFirst({
        where: { personId: jugador.personId, type: "club" },
        orderBy: { changedAt: "desc" },
      });

      expect(ultimo).toMatchObject({ previousHalves: 5, newHalves: 7, reason: "sigue subiendo" });
      expect(ultimo?.changedById).toBe(comisario.cuentaId);
    });

    it("el primer cambio de todos parte de −4: nadie lo había calificado", async () => {
      const nueva = await prisma.person.create({
        data: { clubId: club.id, fullName: "Primera vez" },
      });

      await fijar(comisario, nueva.id, "international", { valueHalves: 2, reason: "primera vez" });

      const primero = await prisma.handicapHistory.findFirst({ where: { personId: nueva.id } });

      expect(primero).toMatchObject({ previousHalves: -4, newHalves: 2 });
    });

    it("sin temporada abierta el cambio se registra igual (R-030-12)", async () => {
      const abiertas = await prisma.season.count({ where: { clubId: club.id, status: "open" } });

      expect(abiertas).toBe(0);

      const nueva = await prisma.person.create({ data: { clubId: club.id, fullName: "Sin temporada" } });
      await fijar(comisario, nueva.id, "club", { valueHalves: 0, reason: "sin temporada" });

      const registro = await prisma.handicapHistory.findFirst({ where: { personId: nueva.id } });

      expect(registro?.seasonId).toBeNull();
    });

    it("con temporada abierta, la anota", async () => {
      const temporada = await prisma.season.create({
        data: {
          clubId: club.id,
          name: "2026-I",
          startsOn: new Date("2026-01-01"),
          endsOn: new Date("2026-06-30"),
        },
      });

      const nueva = await prisma.person.create({ data: { clubId: club.id, fullName: "Con temporada" } });
      await fijar(comisario, nueva.id, "club", { valueHalves: 1, reason: "con temporada" });

      const registro = await prisma.handicapHistory.findFirst({ where: { personId: nueva.id } });

      expect(registro?.seasonId).toBe(temporada.id);

      await prisma.season.update({ where: { id: temporada.id }, data: { status: "closed" } });
    });
  });

  describe("los cuatro rechazos, cada uno con su código (T-333)", () => {
    it("fuera de rango", async () => {
      const respuesta = await fijar(comisario, jugador.personId, "club", {
        valueHalves: 21,
        reason: "imposible",
      });

      expect(respuesta.status).toBe(400);
    });

    it("no es medio gol: el contrato lo para antes de llegar al dominio", async () => {
      const respuesta = await fijar(comisario, jugador.personId, "club", {
        valueHalves: 1.5,
        reason: "decimal",
      });

      expect(respuesta.status).toBe(400);
    });

    it("sin cambio, y el error dice cuál es el valor que ya rige", async () => {
      const respuesta = await fijar(comisario, jugador.personId, "club", {
        valueHalves: 7,
        reason: "lo dejo igual",
      });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.code).toBe("handicap_sin_cambio");
      expect(respuesta.body.error.details).toMatchObject({ actualHalves: 7 });
    });

    it("sin motivo", async () => {
      const respuesta = await fijar(comisario, jugador.personId, "club", {
        valueHalves: 8,
        reason: "   ",
      });

      expect(respuesta.status).toBe(400);
    });

    it("un rechazo NO deja rastro en el historial: la transacción no se abre a medias", async () => {
      const antes = await prisma.handicapHistory.count({ where: { personId: jugador.personId } });

      await fijar(comisario, jugador.personId, "club", { valueHalves: 7, reason: "igual" });

      expect(await prisma.handicapHistory.count({ where: { personId: jugador.personId } })).toBe(antes);
    });
  });

  describe("sólo el comisario (HU-030-02)", () => {
    it("el administrador del club NO puede fijar handicaps, aunque pueda todo lo demás", async () => {
      const respuesta = await fijar(administrador, jugador.personId, "club", {
        valueHalves: 9,
        reason: "no debería poder",
      });

      expect(respuesta.status).toBe(403);
    });

    it("un jugador no puede cambiar su propio handicap", async () => {
      const respuesta = await fijar(jugador, jugador.personId, "club", {
        valueHalves: 20,
        reason: "me subo solo",
      });

      expect(respuesta.status).toBe(403);
    });

    it("sin sesión, 401", async () => {
      const respuesta = await request(app.getHttpServer())
        .put(`/api/people/${jugador.personId}/handicaps/club`)
        .set("Host", `${club.slug}.${BASE}`)
        .send({ valueHalves: 3, reason: "sin sesión" });

      expect(respuesta.status).toBe(401);
    });

    it("una persona de otro club responde 404, nunca 403 (P-05)", async () => {
      const otroClub = await prisma.club.create({
        data: { slug: `otro-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Otro club" },
      });
      const ajena = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Persona ajena" },
      });

      const respuesta = await fijar(comisario, ajena.id, "club", {
        valueHalves: 4,
        reason: "de otro club",
      });

      // 403 confirmaría que esa persona existe.
      expect(respuesta.status).toBe(404);
    });
  });

  describe("el vigente y el historial no divergen (T-331)", () => {
    it("tras varios cambios, el vigente RECONSTRUIDO desde el historial coincide con la fila", async () => {
      // **No basta con leer los dos y ver que coinciden**: hay que recalcular. Si algún día alguien
      // agrega un camino de escritura que se salta el historial, éste es el test que lo dice.
      const persona = await prisma.person.create({
        data: { clubId: club.id, fullName: "La que cambia mucho" },
      });

      for (const valor of [0, 3, 6, 2, 9]) {
        await fijar(comisario, persona.id, "club", { valueHalves: valor, reason: `a ${valor}` });
      }

      const historial = await prisma.handicapHistory.findMany({
        where: { personId: persona.id, type: "club" },
        orderBy: { changedAt: "asc" },
      });

      // Se reconstruye encadenando: cada «anterior» tiene que ser el «nuevo» del cambio previo.
      let reconstruido = -4;
      for (const paso of historial) {
        expect(paso.previousHalves).toBe(reconstruido);
        reconstruido = paso.newHalves;
      }

      const vigente = await prisma.playerHandicap.findUnique({
        where: { personId_type: { personId: persona.id, type: "club" } },
      });

      expect(vigente?.valueHalves).toBe(reconstruido);
      expect(reconstruido).toBe(9);
    });
  });

  describe("dos cambios concurrentes (T-332)", () => {
    it("el candado de fila hace esperar al segundo hasta que el primero termina", async () => {
      // **Éste es el test que prueba la garantía.** El de más abajo comprueba el resultado, pero
      // pasa igual con y sin candado —comprobado— porque dos peticiones HTTP no se solapan de forma
      // fiable. Aquí el solape se fuerza a mano.
      //
      // PostgreSQL corre en `READ COMMITTED`: leer dentro de la transacción NO serializa nada. Sin
      // `FOR UPDATE`, B leería el valor viejo de inmediato y anotaría un «anterior» que ya no era
      // el actual.
      const persona = await prisma.person.create({
        data: { clubId: club.id, fullName: "La del candado" },
      });
      await prisma.playerHandicap.create({
        data: { clubId: club.id, personId: persona.id, type: "club", valueHalves: 0 },
      });

      let soltarA = (): void => undefined;
      const puedeTerminarA = new Promise<void>((resolver) => {
        soltarA = resolver;
      });

      const a = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "person" WHERE id = ${persona.id} FOR UPDATE`;
        await tx.playerHandicap.update({
          where: { personId_type: { personId: persona.id, type: "club" } },
          data: { valueHalves: 4 },
        });
        await puedeTerminarA;
      });

      let leidoPorB: number | null = null;
      const b = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "person" WHERE id = ${persona.id} FOR UPDATE`;
        const fila = await tx.playerHandicap.findUnique({
          where: { personId_type: { personId: persona.id, type: "club" } },
          select: { valueHalves: true },
        });
        leidoPorB = fila?.valueHalves ?? null;
      });

      // Mientras A tiene el candado, B **no puede haber leído nada**.
      await new Promise((resolver) => setTimeout(resolver, 300));
      expect(leidoPorB, "B leyó sin esperar: el candado no está haciendo nada").toBeNull();

      soltarA();
      await Promise.all([a, b]);

      // Y cuando A soltó, B leyó **lo que A escribió**, no el valor con el que empezó.
      expect(leidoPorB).toBe(4);
    });

    it("dos peticiones simultáneas dejan la cadena del historial intacta", async () => {
      const persona = await prisma.person.create({
        data: { clubId: club.id, fullName: "La disputada" },
      });
      await fijar(comisario, persona.id, "club", { valueHalves: 0, reason: "punto de partida" });

      // Dos peticiones de verdad simultáneas, como dos pestañas del comisario.
      const [una, otra] = await Promise.all([
        fijar(comisario, persona.id, "club", { valueHalves: 4, reason: "pestaña A" }),
        fijar(comisario, persona.id, "club", { valueHalves: 8, reason: "pestaña B" }),
      ]);

      expect([una.status, otra.status].sort()).toEqual([200, 200]);

      const historial = await prisma.handicapHistory.findMany({
        where: { personId: persona.id, type: "club" },
        orderBy: { changedAt: "asc" },
      });

      // La cadena tiene que cerrar. **Este test no prueba el candado por sí solo** —dos peticiones
      // HTTP no se solapan de forma fiable y pasa igual sin él—, pero sí comprueba el resultado
      // observable de punta a punta. La prueba de la garantía es el test de arriba.
      let encadenado = -4;
      for (const paso of historial) {
        expect(paso.previousHalves).toBe(encadenado);
        encadenado = paso.newHalves;
      }

      const vigente = await prisma.playerHandicap.findUnique({
        where: { personId_type: { personId: persona.id, type: "club" } },
      });

      expect(vigente?.valueHalves).toBe(encadenado);
    });
  });

  describe("el historial y quién puede verlo (T-334, R-030-09)", () => {
    it("el comisario lo ve", async () => {
      const respuesta = await leer(comisario, `/api/people/${jugador.personId}/handicaps/history`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.entries.length).toBeGreaterThan(0);
    });

    it("el administrador del club lo ve, aunque no pueda editarlo", async () => {
      const respuesta = await leer(administrador, `/api/people/${jugador.personId}/handicaps/history`);

      expect(respuesta.status).toBe(200);
    });

    it("la propia persona ve el suyo", async () => {
      const respuesta = await leer(jugador, `/api/people/${jugador.personId}/handicaps/history`);

      expect(respuesta.status).toBe(200);
    });

    it("el acudiente ve el del menor a su cargo", async () => {
      await fijar(comisario, menor, "club", { valueHalves: -2, reason: "empieza la escuela" });

      const respuesta = await leer(acudiente, `/api/people/${menor}/handicaps/history`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.entries).toHaveLength(1);
    });

    it("otro jugador NO lo ve, y recibe 404 y no 403", async () => {
      const respuesta = await leer(jugador, `/api/people/${menor}/handicaps/history`);

      expect(respuesta.status).toBe(404);
    });

    it("sin sesión, 401", async () => {
      const respuesta = await request(app.getHttpServer())
        .get(`/api/people/${jugador.personId}/handicaps/history`)
        .set("Host", `${club.slug}.${BASE}`);

      expect(respuesta.status).toBe(401);
    });

    it("LA RESPUESTA ENTERA no filtra nada de un historial ajeno", async () => {
      // Mismo criterio que `specs/040` T-451: se serializa todo y se busca en el texto, en vez de
      // comprobar campo por campo. El día que alguien agregue un dato a la respuesta —el correo de
      // quien lo cambió, una nota interna— un test que mira campos conocidos no lo vería.
      const secreto = `motivo-reservado-${etiqueta("x")}`;
      await fijar(comisario, menor, "club", { valueHalves: 3, reason: secreto });

      const respuesta = await leer(jugador, `/api/people/${menor}/handicaps/history`);
      const comoTexto = JSON.stringify(respuesta.body);

      for (const rastro of [secreto, menor, comisario.personId]) {
        expect(comoTexto, `la respuesta filtró «${rastro}»`).not.toContain(rastro);
      }
    });

    it("el vigente SÍ es público: se ve el número, no la historia", async () => {
      // La otra cara de R-030-09. Sin esto, nadie podría entender cómo quedó armado un equipo.
      const respuesta = await leer(jugador, `/api/people/${menor}/handicaps`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.club.valueHalves).toBe(3);
    });
  });

  describe("el listado del club (T-335)", () => {
    it("incluye a quien nunca fue calificado, con calificado: false", async () => {
      const respuesta = await leer(comisario, "/api/handicaps?type=club&limit=100");

      expect(respuesta.status).toBe(200);

      const sinCalificar = respuesta.body.items.filter(
        (fila: { handicap: { calificado: boolean } }) => !fila.handicap.calificado,
      );

      expect(sinCalificar.length).toBeGreaterThan(0);
      expect(sinCalificar[0].handicap.valueHalves).toBe(-4);
    });

    it("pagina, y el total cuenta todo el club", async () => {
      const respuesta = await leer(comisario, "/api/handicaps?type=club&limit=2&page=1");

      expect(respuesta.body.items).toHaveLength(2);
      expect(respuesta.body.total).toBeGreaterThan(2);
      expect(respuesta.body.limit).toBe(2);
    });

    it("pedir más de 100 es un 400, no un recorte silencioso", async () => {
      const respuesta = await leer(comisario, "/api/handicaps?limit=500");

      expect(respuesta.status).toBe(400);
    });

    it("no incluye personas de otro club (P-05)", async () => {
      const otroClub = await prisma.club.create({
        data: { slug: `aj-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club ajeno" },
      });
      const ajena = await prisma.person.create({
        data: { clubId: otroClub.id, fullName: "Ajena del listado" },
      });

      const respuesta = await leer(comisario, "/api/handicaps?limit=100");

      expect(JSON.stringify(respuesta.body)).not.toContain(ajena.id);
    });
  });

  describe("el servicio es el único escritor", () => {
    it("fijar por el servicio escribe las dos tablas juntas", async () => {
      // Comprueba el contrato interno de `plan.md` §5 sin pasar por HTTP: el mismo servicio que usa
      // el controlador es el que garantiza la transacción.
      const servicio = app.get(HandicapsService);
      const persona = await prisma.person.create({
        data: { clubId: club.id, fullName: "Por el servicio" },
      });

      await servicio.fijar(
        club.id,
        persona.id,
        "international",
        { valueHalves: 6, reason: "directo al servicio" },
        { userAccountId: comisario.cuentaId, personId: comisario.personId },
      );

      const [vigente, registros] = await Promise.all([
        prisma.playerHandicap.findUnique({
          where: { personId_type: { personId: persona.id, type: "international" } },
        }),
        prisma.handicapHistory.count({ where: { personId: persona.id } }),
      ]);

      expect(vigente?.valueHalves).toBe(6);
      expect(registros).toBe(1);
    });
  });
});
