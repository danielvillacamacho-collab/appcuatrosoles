import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { DecisionProcessor } from "../../src/practices/decision.processor.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

/** Un reloj que el test mueve a mano: es lo que permite probar «el sistema estuvo caído». */
class RelojDePrueba implements Clock {
  private instante = new Date("2026-05-01T12:00:00Z");

  now(): Date {
    return this.instante;
  }

  mover(a: string): void {
    this.instante = new Date(a);
  }
}

/**
 * La ventana de este archivo, **anterior a la de todos los demás specs**.
 *
 * El proceso de decisión es global por diseño: pide «las publicadas que ya vencieron», sin filtrar
 * por club. Con fechas posteriores a las de `practices.int-spec`, cada corrida encontraba primero
 * las prácticas de ese archivo, se llevaba el cupo de `take` y no llegaba nunca a las de aquí — el
 * síntoma era una práctica que se quedaba en `published` sin ningún error.
 *
 * Poniendo esta ventana **antes** que la de todos, las de los otros specs todavía no vencieron
 * cuando este reloj corre, y el proceso sólo encuentra las propias.
 */
const LA_PRACTICA = {
  startsAt: "2026-05-10T16:00:00.000Z",
  endsAt: "2026-05-10T17:30:00.000Z",
  closeAt: "2026-05-10T14:00:00.000Z",
  decisionAt: "2026-05-10T15:00:00.000Z",
};

describe("La decisión automática (T-540 a T-544)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let proceso: DecisionProcessor;
  const reloj = new RelojDePrueba();

  let clubId: string;
  let fieldId: string;
  let cuentaId: string;
  let personas: { personId: string; cuentaId: string }[];

  let siguienteFranja = 0;

  async function crearPersona(): Promise<{ personId: string; cuentaId: string }> {
    const marca = etiqueta("dec");
    const persona = await prisma.person.create({ data: { clubId, fullName: `Persona ${marca}` } });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });

    return { personId: persona.id, cuentaId: cuenta.id };
  }

  /** Una práctica publicada, con su reserva de cancha, en una franja que nadie más usa. */
  async function practicaPublicada(minPlayers = 2, targetPlayers = 2): Promise<string> {
    siguienteFranja += 1;
    const dia = 10 + Math.floor(siguienteFranja / 6);
    const hora = 12 + (siguienteFranja % 6);
    const base = `2026-05-${String(dia).padStart(2, "0")}`;

    const reserva = await prisma.fieldBooking.create({
      data: {
        clubId,
        fieldId,
        startsAt: new Date(`${base}T${String(hora).padStart(2, "0")}:00:00.000Z`),
        endsAt: new Date(`${base}T${String(hora).padStart(2, "0")}:45:00.000Z`),
        type: "practice",
        createdById: cuentaId,
      },
    });

    const practica = await prisma.practice.create({
      data: {
        clubId,
        fieldId,
        startsAt: new Date(LA_PRACTICA.startsAt),
        endsAt: new Date(LA_PRACTICA.endsAt),
        chukkers: 6,
        handicapType: "club",
        targetPlayers,
        minPlayers,
        applicationsCloseAt: new Date(LA_PRACTICA.closeAt),
        decisionAt: new Date(LA_PRACTICA.decisionAt),
        status: "published",
        fieldBookingId: reserva.id,
        createdById: cuentaId,
      },
      select: { id: true },
    });

    return practica.id;
  }

  async function postular(practiceId: string, cuantas: number): Promise<void> {
    for (let i = 0; i < cuantas; i += 1) {
      await prisma.practiceApplication.create({
        data: {
          clubId,
          practiceId,
          personId: personas[i]?.personId ?? "",
          chukkersOffered: 4,
        },
      });
    }
  }

  async function avisosDe(practiceId: string): Promise<{ type: string }[]> {
    const mensajes = await prisma.outboxMessage.findMany({
      where: { type: { in: ["practice.confirmed", "practice.cancelled"] } },
      select: { type: true, payload: true },
    });

    return mensajes.filter((mensaje) =>
      JSON.stringify(mensaje.payload).includes(practiceId),
    );
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DOMAIN)
      .useValue("polo.test")
      .overrideProvider(CLOCK)
      .useValue(reloj)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    proceso = app.get(DecisionProcessor);

    const club = await prisma.club.create({
      data: { slug: `dec-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club de decisión" },
    });
    clubId = club.id;
    fieldId = (await prisma.field.create({ data: { clubId, name: "Cancha 1" } })).id;

    personas = [await crearPersona(), await crearPersona(), await crearPersona()];
    cuentaId = personas[0]?.cuentaId ?? "";
  });

  afterAll(async () => {
    await app.close();
  });

  describe("el proceso (T-540)", () => {
    it("con los jugadores suficientes, confirma y avisa a todos", async () => {
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(2, 2);
      await postular(practiceId, 2);

      expect(await proceso.decidirVencidas()).toBeGreaterThanOrEqual(1);

      const decidida = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });

      expect(decidida.status).toBe("confirmed");
      expect(decidida.decidedAt).not.toBeNull();
      expect(await avisosDe(practiceId)).toHaveLength(2);
    });

    it("sin los suficientes, cancela Y LIBERA LA CANCHA", async () => {
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(3, 4);
      await postular(practiceId, 1);

      await proceso.decidirVencidas();

      const decidida = await prisma.practice.findUniqueOrThrow({
        where: { id: practiceId },
        include: { fieldBooking: true },
      });

      expect(decidida.status).toBe("cancelled");
      expect(decidida.cancellationReason).toContain("mínimo");
      // La cancha se libera de verdad: `cancelled_at` es lo que la saca de la restricción de
      // exclusión y deja la franja disponible.
      expect(decidida.fieldBooking?.cancelledAt).not.toBeNull();
    });

    it("una que todavía no vence no se toca", async () => {
      reloj.mover("2026-05-10T14:30:00.000Z"); // media hora antes de decidir
      const practiceId = await practicaPublicada(2, 2);
      await postular(practiceId, 2);

      await proceso.decidirVencidas();

      const sigue = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });

      expect(sigue.status).toBe("published");
      expect(await avisosDe(practiceId)).toHaveLength(0);
    });

    it("materializa quién quedó dentro: deja de ser una vista y pasa a ser un hecho", async () => {
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(1, 1);
      await postular(practiceId, 3);

      await proceso.decidirVencidas();

      const postulaciones = await prisma.practiceApplication.findMany({
        where: { practiceId },
        orderBy: { appliedAt: "asc" },
      });

      expect(postulaciones[0]?.outcome).toBe("accepted");
      expect(postulaciones[1]?.outcome).toBe("rejected");
      expect(postulaciones[2]?.outcome).toBe("rejected");
    });

    it("en una cancelada NADIE queda aceptado", async () => {
      // Marcar «dentro» a quien nunca jugó ensuciaría la estadística que 051 va a leer de aquí.
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(5, 5);
      await postular(practiceId, 2);

      await proceso.decidirVencidas();

      const postulaciones = await prisma.practiceApplication.findMany({ where: { practiceId } });

      expect(postulaciones.every((una) => una.outcome === "rejected")).toBe(true);
    });
  });

  describe("el sistema estuvo caído (T-541, R-050-11)", () => {
    it("tres horas tarde, la práctica se decide igual", async () => {
      // **Es la prueba de que no hay nada programado que se pueda perder.** Un trabajo encolado
      // para las 3:00 p.m. que no se disparó no deja rastro; una consulta por «lo vencido» sí.
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(2, 2);
      await postular(practiceId, 2);

      reloj.mover("2026-05-10T18:00:00.000Z");

      expect(await proceso.decidirVencidas()).toBeGreaterThanOrEqual(1);
      expect(
        (await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } })).status,
      ).toBe("confirmed");
    });

    it("una semana tarde, también", async () => {
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(4, 4);
      await postular(practiceId, 1);

      reloj.mover("2026-05-17T12:00:00.000Z");
      await proceso.decidirVencidas();

      expect(
        (await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } })).status,
      ).toBe("cancelled");
    });
  });

  describe("no avisa dos veces (T-542, R-050-10)", () => {
    it("correr el proceso dos veces seguidas deja UN aviso por persona", async () => {
      // Se cuentan los mensajes encolados; no se confía en el estado. La idempotencia sale de que
      // la consulta pide `status = published` y la propia transacción lo cambia.
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(2, 2);
      await postular(practiceId, 2);

      await proceso.decidirVencidas();
      const despuesDeLaPrimera = await avisosDe(practiceId);

      await proceso.decidirVencidas();
      const despuesDeLaSegunda = await avisosDe(practiceId);

      expect(despuesDeLaPrimera).toHaveLength(2);
      expect(despuesDeLaSegunda).toHaveLength(2);
    });

    it("la segunda corrida no cuenta la práctica como decidida", async () => {
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(2, 2);
      await postular(practiceId, 2);

      await proceso.decidirVencidas();

      // Ya no queda nada vencido y publicado: la consulta no la encuentra.
      const pendientes = await prisma.practice.count({
        where: { id: practiceId, status: "published" },
      });

      expect(pendientes).toBe(0);
    });
  });

  describe("la decisión y un retiro simultáneos (T-543)", () => {
    it("el candado de fila hace esperar al retiro hasta que la decisión termina", async () => {
      // **El solape se fuerza a mano.** Es la lección de `specs/030` T-332: con `Promise.all` sobre
      // dos peticiones el test pasaba igual con y sin la garantía, porque nunca creaba la carrera.
      //
      // PostgreSQL corre en `READ COMMITTED`: sin `FOR UPDATE`, el proceso de decisión y alguien
      // retirándose leen los dos el mismo estado y la práctica se decide con una foto que ya no es
      // cierta.
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(2, 2);
      await postular(practiceId, 2);

      let soltarA = (): void => undefined;
      const puedeTerminarA = new Promise<void>((resolver) => {
        soltarA = resolver;
      });
      // La decisión avisa cuando ya tiene el candado; el retiro no arranca antes. Sin esta señal
      // las dos transacciones salen a la vez y a veces gana el retiro, y el test falla de forma
      // intermitente por un motivo que no es el que dice medir.
      let avisarQueAgarro = (): void => undefined;
      const tieneElCandado = new Promise<void>((resolver) => {
        avisarQueAgarro = resolver;
      });

      const decidiendo = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "practice" WHERE id = ${practiceId} FOR UPDATE`;
        await tx.practice.update({ where: { id: practiceId }, data: { status: "confirmed" } });
        avisarQueAgarro();
        await puedeTerminarA;
      });

      await tieneElCandado;

      let seRetiro = false;
      const retirandose = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "practice" WHERE id = ${practiceId} FOR UPDATE`;
        seRetiro = true;
      });

      await new Promise((resolver) => setTimeout(resolver, 300));
      expect(seRetiro, "el retiro no esperó: el candado no está haciendo nada").toBe(false);

      soltarA();
      await Promise.all([decidiendo, retirandose]);

      expect(seRetiro).toBe(true);
    });
  });

  describe("los avisos (T-544)", () => {
    it("distinguen a quien está dentro de quien quedó en espera", async () => {
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(1, 1);
      await postular(practiceId, 2);

      await proceso.decidirVencidas();

      const avisos = await prisma.outboxMessage.findMany({
        where: { type: "practice.confirmed" },
        select: { payload: true },
      });
      const deEsta = avisos.filter((aviso) => JSON.stringify(aviso.payload).includes(practiceId));
      const dentro = deEsta.filter(
        (aviso) => (aviso.payload as { dentro?: boolean }).dentro === true,
      );

      expect(deEsta).toHaveLength(2);
      expect(dentro).toHaveLength(1);
    });

    it("son del tipo que SE PUEDE silenciar, a diferencia de los de identidad", async () => {
      // En `specs/010` un atajo del procesador hacía inevitable todo aviso, y las preferencias no
      // se podían apagar. Éstos son los primeros que de verdad se pueden.
      reloj.mover(LA_PRACTICA.decisionAt);
      const practiceId = await practicaPublicada(2, 2);
      await postular(practiceId, 2);

      await proceso.decidirVencidas();

      const [aviso] = await avisosDe(practiceId);

      expect(aviso?.type.startsWith("identity.")).toBe(false);
      expect(aviso?.type).toBe("practice.confirmed");
    });
  });
});
