import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { crearClienteDePrueba, etiqueta } from "../db.js";

/**
 * T-401 · La garantía del módulo, probada **provocando su rechazo**.
 *
 * Estos tests no pasan por la aplicación: van directo a la base, porque lo que se prueba es que
 * **la base** impide el solapamiento. Si esto se probara contra un servicio, un día alguien
 * cambiaría el servicio, el test seguiría pasando, y la garantía se habría ido sin que nadie lo
 * notara.
 */
const UNA_TARDE = "2026-09-01";

/** Un instante fijo: la regla del repo prohíbe `new Date()` sin argumentos, y con razón — un test
 *  que depende de la hora en que corre es un test que un día falla sin que nada haya cambiado. */
const CUANDO_SE_CANCELO = new Date("2026-08-31T12:00:00.000Z");

describe("Canchas y reservas: la base impide el solapamiento (T-401, R-040-02)", () => {
  const prisma: PrismaClient = crearClienteDePrueba();
  let clubId: string;
  let cuentaId: string;
  let canchaUno: string;
  let canchaDos: string;

  /** `2026-09-01 16:00` en Bogotá, que es `21:00` UTC. */
  function alas(hora: string): Date {
    return new Date(`${UNA_TARDE}T${hora}:00-05:00`);
  }

  async function reservar(
    fieldId: string,
    desde: string,
    hasta: string,
    extra: { cancelledAt?: Date } = {},
  ): Promise<{ id: string }> {
    return prisma.fieldBooking.create({
      data: {
        clubId,
        fieldId,
        startsAt: alas(desde),
        endsAt: alas(hasta),
        type: "practice",
        createdById: cuentaId,
        ...extra,
      },
      select: { id: true },
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");

    const marca = etiqueta("canchas").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const club = await prisma.club.create({ data: { slug: marca, name: "Club con canchas" } });
    clubId = club.id;

    const persona = await prisma.person.create({
      data: { clubId, fullName: "Quien programa" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });
    cuentaId = cuenta.id;

    canchaUno = (await prisma.field.create({ data: { clubId, name: "Cancha 1" } })).id;
    canchaDos = (await prisma.field.create({ data: { clubId, name: "Cancha 2" } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("una franja libre se reserva sin problema", async () => {
    await expect(reservar(canchaUno, "16:00", "17:30")).resolves.toBeDefined();
  });

  it("un solape de UN MINUTO se rechaza", async () => {
    // El minuto importa: si la restricción estuviera mal escrita —comparando sólo el inicio, por
    // ejemplo— este caso pasaría y el choque aparecería recién en la cancha.
    await reservar(canchaDos, "16:00", "17:30");

    await expect(reservar(canchaDos, "17:29", "18:00")).rejects.toThrow();
  });

  it("el borde NO choca: lo que empieza a las 5:30 va después de lo que termina a las 5:30", async () => {
    // R-040-04, la convención semiabierta. Sin ella, dos actividades consecutivas se rechazarían
    // entre sí y el club no podría programar una práctica detrás de otra.
    const cancha = (await prisma.field.create({ data: { clubId, name: "Cancha del borde" } })).id;

    await reservar(cancha, "16:00", "17:30");

    await expect(reservar(cancha, "17:30", "19:00")).resolves.toBeDefined();
  });

  it("otra cancha a la misma hora no choca: la restricción es por cancha", async () => {
    const a = (await prisma.field.create({ data: { clubId, name: "Paralela A" } })).id;
    const b = (await prisma.field.create({ data: { clubId, name: "Paralela B" } })).id;

    await reservar(a, "16:00", "17:30");

    await expect(reservar(b, "16:00", "17:30")).resolves.toBeDefined();
  });

  it("una reserva cancelada NO ocupa la franja (R-040-03)", async () => {
    const cancha = (await prisma.field.create({ data: { clubId, name: "Cancha con cancelada" } })).id;

    await reservar(cancha, "16:00", "17:30", { cancelledAt: CUANDO_SE_CANCELO });

    await expect(reservar(cancha, "16:00", "17:30")).resolves.toBeDefined();
  });

  it("cancelar libera la franja de inmediato", async () => {
    const cancha = (await prisma.field.create({ data: { clubId, name: "Cancha que se libera" } })).id;
    const reserva = await reservar(cancha, "16:00", "17:30");

    await expect(reservar(cancha, "16:00", "17:30")).rejects.toThrow();

    await prisma.fieldBooking.update({
      where: { id: reserva.id },
      data: { cancelledAt: CUANDO_SE_CANCELO },
    });

    await expect(reservar(cancha, "16:00", "17:30")).resolves.toBeDefined();
  });

  it("una reserva que termina antes de empezar se rechaza: es un dato roto, no un caso de negocio", async () => {
    await expect(reservar(canchaUno, "18:00", "16:00")).rejects.toThrow();
  });

  it("el rango generado NO se puede escribir: no hay forma de guardar uno incoherente", async () => {
    // Es lo que hace que la columna generada valga la pena. Si se pudiera escribir, alguien podría
    // guardar un rango que no corresponde a las fechas que muestra la aplicación, y la restricción
    // estaría defendiendo un dato que nadie ve.
    const cancha = (await prisma.field.create({ data: { clubId, name: "Cancha del rango" } })).id;

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO field_booking (id, club_id, field_id, starts_at, ends_at, time_range, type, created_by_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, '[2026-01-01,2026-01-02)', 'practice', $5)`,
        clubId,
        cancha,
        alas("16:00"),
        alas("17:30"),
        cuentaId,
      ),
    ).rejects.toThrow(/non-DEFAULT value|generated/iu);
  });

  it("dos canchas del mismo club no se llaman igual", async () => {
    await expect(prisma.field.create({ data: { clubId, name: "Cancha 1" } })).rejects.toThrow();
  });

  it("el mismo nombre sí existe en otro club (P-05)", async () => {
    const otro = await prisma.club.create({
      data: { slug: `otro-${etiqueta("c")}`.toLowerCase().slice(0, 40), name: "Otro club" },
    });

    await expect(
      prisma.field.create({ data: { clubId: otro.id, name: "Cancha 1" } }),
    ).resolves.toBeDefined();
  });

  it("una cancha con reservas no se puede borrar: se archiva (P-06, R-040-08)", async () => {
    const cancha = (await prisma.field.create({ data: { clubId, name: "Cancha con historia" } })).id;
    await reservar(cancha, "16:00", "17:30");

    await expect(prisma.field.delete({ where: { id: cancha } })).rejects.toThrow();

    await expect(
      prisma.field.update({ where: { id: cancha }, data: { status: "archived" } }),
    ).resolves.toBeDefined();
  });
});
