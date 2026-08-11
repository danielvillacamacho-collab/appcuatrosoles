import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { BookingsService } from "../../src/fields/bookings.service.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

/** El día de las pruebas, en Bogotá. El club abre 6:00 y cierra 18:00. */
function alas(hora: string): Date {
  return new Date(`2026-09-01T${hora}:00-05:00`);
}

describe("BookingsService (T-420 a T-422)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reservas: BookingsService;
  let clubId: string;
  let cuentaId: string;

  async function nuevaCancha(nombre = etiqueta("cancha")): Promise<string> {
    const cancha = await prisma.field.create({ data: { clubId, name: nombre } });

    return cancha.id;
  }

  /** Reservar abriendo la transacción aquí, que es como lo harán prácticas y clases. */
  async function reservar(fieldId: string, desde: string, hasta: string): Promise<{ id: string }> {
    return prisma.$transaction((tx) =>
      reservas.reservar(
        tx,
        clubId,
        { fieldId, startsAt: alas(desde), endsAt: alas(hasta), type: "practice" },
        cuentaId,
      ),
    );
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    reservas = app.get(BookingsService);

    const marca = etiqueta("reservas").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const club = await prisma.club.create({ data: { slug: marca, name: "Club de reservas" } });
    clubId = club.id;

    const persona = await prisma.person.create({ data: { clubId, fullName: "Quien programa" } });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });
    cuentaId = cuenta.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("reservar (T-420)", () => {
    it("ocupa la franja", async () => {
      const cancha = await nuevaCancha();

      await expect(reservar(cancha, "16:00", "17:30")).resolves.toMatchObject({
        id: expect.any(String),
      });
    });

    it("si la transacción se revierte, la reserva se va con ella", async () => {
      // Es la razón de que el servicio reciba la transacción: crear una práctica y ocupar su cancha
      // tienen que ser la misma operación. Si fueran dos, existiría «práctica sin cancha».
      const cancha = await nuevaCancha();

      await expect(
        prisma.$transaction(async (tx) => {
          await reservas.reservar(
            tx,
            clubId,
            { fieldId: cancha, startsAt: alas("16:00"), endsAt: alas("17:30"), type: "practice" },
            cuentaId,
          );

          throw new Error("algo falló después de reservar");
        }),
      ).rejects.toThrow();

      expect(await prisma.fieldBooking.count({ where: { fieldId: cancha } })).toBe(0);
    });

    it("una cancha de otro club no existe desde aquí: 404, nunca 403 (P-05)", async () => {
      const ajeno = await prisma.club.create({
        data: { slug: `ajeno-${etiqueta("r")}`.toLowerCase().slice(0, 40), name: "Otro club" },
      });
      const canchaAjena = await prisma.field.create({
        data: { clubId: ajeno.id, name: "Cancha ajena" },
      });

      await expect(reservar(canchaAjena.id, "16:00", "17:30")).rejects.toMatchObject({ status: 404 });
    });

    it("una cancha fuera de servicio no admite reservas", async () => {
      // El estado no es decorativo: es lo que impide programar sobre una cancha que se está
      // reparando.
      const cancha = await nuevaCancha();
      await prisma.field.update({ where: { id: cancha }, data: { status: "maintenance" } });

      await expect(reservar(cancha, "16:00", "17:30")).rejects.toMatchObject({
        code: "cancha_no_disponible",
      });
    });

    it("fuera del horario del club se rechaza diciendo cuál es el problema", async () => {
      const cancha = await nuevaCancha();

      await expect(reservar(cancha, "05:00", "06:30")).rejects.toMatchObject({
        code: "fuera_del_horario",
        userMessage: expect.stringContaining("no está abierto"),
      });
      await expect(reservar(cancha, "17:00", "19:00")).rejects.toMatchObject({
        code: "fuera_del_horario",
        userMessage: expect.stringContaining("cerrado"),
      });
    });

    it("un rango al revés se rechaza antes de llegar a la base", async () => {
      const cancha = await nuevaCancha();

      await expect(reservar(cancha, "17:30", "16:00")).rejects.toMatchObject({
        code: "rango_invalido",
      });
    });
  });

  describe("el choque, contado como lo entiende una persona (T-421)", () => {
    it("dice CON QUÉ choca, no sólo que chocó", async () => {
      // «Esa cancha está ocupada» deja a alguien mirando un calendario que quizá no muestra el
      // evento —porque es privado de otro— sin entender por qué no puede reservar.
      const cancha = await nuevaCancha();
      await reservar(cancha, "16:00", "17:30");

      const fallo = await reservar(cancha, "17:00", "18:00").catch((error: unknown) => error);

      expect(fallo).toMatchObject({
        code: "cancha_ocupada",
        status: 409,
        details: {
          ocupadoDesde: alas("16:00").toISOString(),
          ocupadoHasta: alas("17:30").toISOString(),
        },
      });
      // El horario, en la zona del club y legible.
      expect((fallo as { userMessage: string }).userMessage).toMatch(/4:00.*5:30/u);
    });

    it("no es un 500, y no revela el nombre de la restricción", async () => {
      const cancha = await nuevaCancha();
      await reservar(cancha, "16:00", "17:30");

      const fallo = await reservar(cancha, "16:30", "17:00").catch((error: unknown) => error);

      expect((fallo as { status: number }).status).toBe(409);
      expect(JSON.stringify(fallo)).not.toContain("no_field_overlap");
    });

    it("el borde no choca: lo que empieza cuando el otro termina entra", async () => {
      const cancha = await nuevaCancha();
      await reservar(cancha, "16:00", "17:30");

      await expect(reservar(cancha, "17:30", "18:00")).resolves.toBeDefined();
    });
  });

  describe("concurrencia de verdad (T-422)", () => {
    it("dos transacciones a la vez sobre la misma franja: entra una y la otra falla", async () => {
      // **Dos inserciones en secuencia no prueban esto**: la segunda vería a la primera y fallaría
      // igual sin la restricción de exclusión. Lo que se prueba aquí es que la base sostiene la
      // regla cuando las dos escrituras están abiertas al mismo tiempo, que es el caso real de dos
      // administradores guardando a la vez.
      const cancha = await nuevaCancha();

      const primera = prisma.$transaction(async (tx) => {
        await reservas.reservar(
          tx,
          clubId,
          { fieldId: cancha, startsAt: alas("16:00"), endsAt: alas("17:30"), type: "practice" },
          cuentaId,
        );

        // Se queda abierta mientras la otra intenta entrar.
        await new Promise((seguir) => setTimeout(seguir, 400));
      });

      const segunda = (async () => {
        // Arranca después de que la primera ya insertó, y con la transacción de aquélla **abierta**.
        await new Promise((seguir) => setTimeout(seguir, 150));

        return prisma.$transaction((tx) =>
          reservas.reservar(
            tx,
            clubId,
            { fieldId: cancha, startsAt: alas("17:00"), endsAt: alas("18:00"), type: "practice" },
            cuentaId,
          ),
        );
      })();

      const [resultadoPrimera, resultadoSegunda] = await Promise.allSettled([primera, segunda]);

      expect(resultadoPrimera.status).toBe("fulfilled");
      expect(resultadoSegunda.status).toBe("rejected");

      // Y queda **una** reserva, no dos.
      expect(await prisma.fieldBooking.count({ where: { fieldId: cancha, cancelledAt: null } })).toBe(1);
    });
  });

  describe("cancelar (T-420)", () => {
    it("libera la franja y conserva que existió (P-06)", async () => {
      const cancha = await nuevaCancha();
      const reserva = await reservar(cancha, "16:00", "17:30");

      await reservas.cancelar(clubId, reserva.id);

      await expect(reservar(cancha, "16:00", "17:30")).resolves.toBeDefined();
      expect(await prisma.fieldBooking.count({ where: { id: reserva.id } })).toBe(1);
    });

    it("cancelar dos veces no falla: cerrar algo ya cerrado es un éxito", async () => {
      const cancha = await nuevaCancha();
      const reserva = await reservar(cancha, "16:00", "17:30");

      await reservas.cancelar(clubId, reserva.id);

      await expect(reservas.cancelar(clubId, reserva.id)).resolves.toBeUndefined();
    });

    it("una reserva de otro club no existe desde aquí", async () => {
      const ajeno = await prisma.club.create({
        data: { slug: `ajeno2-${etiqueta("r")}`.toLowerCase().slice(0, 40), name: "Otro club" },
      });
      const cancha = await nuevaCancha();
      const reserva = await reservar(cancha, "16:00", "17:30");

      await expect(reservas.cancelar(ajeno.id, reserva.id)).rejects.toMatchObject({ status: 404 });
    });
  });
});
