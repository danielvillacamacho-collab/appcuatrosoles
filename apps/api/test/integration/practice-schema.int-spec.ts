import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { etiqueta } from "../db.js";

/**
 * T-520 — lo que garantiza la **base**, probado contra la base.
 *
 * Sin pasar por la aplicación, con el mismo criterio de `specs/040` T-401 y `specs/030` T-320: lo
 * que se prueba es que el esquema impide lo que dice impedir.
 */
describe("Esquema de prácticas (T-520)", () => {
  let prisma: PrismaClient;
  let clubId: string;
  let fieldId: string;
  let personId: string;
  let otraPersonaId: string;
  let cuentaId: string;

  async function crearPractica(extra: Record<string, unknown> = {}): Promise<string> {
    const creada = await prisma.practice.create({
      data: {
        clubId,
        fieldId,
        startsAt: new Date("2026-10-01T21:00:00Z"),
        endsAt: new Date("2026-10-01T23:00:00Z"),
        chukkers: 6,
        handicapType: "club",
        targetPlayers: 8,
        minPlayers: 6,
        applicationsCloseAt: new Date("2026-10-01T20:00:00Z"),
        decisionAt: new Date("2026-10-01T20:30:00Z"),
        createdById: cuentaId,
        ...extra,
      },
      select: { id: true },
    });

    return creada.id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: inject("databaseUrl") } } });

    const club = await prisma.club.create({
      data: { slug: `prac-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club de prácticas" },
    });
    clubId = club.id;

    fieldId = (await prisma.field.create({ data: { clubId, name: "Cancha 1" } })).id;

    const persona = await prisma.person.create({ data: { clubId, fullName: "Postulante" } });
    personId = persona.id;
    otraPersonaId = (await prisma.person.create({ data: { clubId, fullName: "Otra" } })).id;

    cuentaId = (
      await prisma.userAccount.create({
        data: {
          personId,
          email: `${etiqueta("prac")}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("una sola postulación vigente, pero se puede volver", () => {
    it("la misma persona no se postula dos veces a la misma práctica", async () => {
      const practiceId = await crearPractica();
      await prisma.practiceApplication.create({
        data: { clubId, practiceId, personId, chukkersOffered: 4 },
      });

      await expect(
        prisma.practiceApplication.create({
          data: { clubId, practiceId, personId, chukkersOffered: 6 },
        }),
      ).rejects.toThrow(/Unique constraint/u);
    });

    it("PERO quien se retiró puede volver a postularse", async () => {
      // Es exactamente lo que permite el índice **parcial** y lo que uno total impediría. Sin esto,
      // retirarse sería irreversible, que no es lo que dice HU-050-03.
      const practiceId = await crearPractica();
      const primera = await prisma.practiceApplication.create({
        data: { clubId, practiceId, personId, chukkersOffered: 4 },
      });

      await prisma.practiceApplication.update({
        where: { id: primera.id },
        data: { withdrawnAt: new Date("2026-09-30T12:00:00Z") },
      });

      const segunda = await prisma.practiceApplication.create({
        data: { clubId, practiceId, personId, chukkersOffered: 4 },
      });

      expect(segunda.id).not.toBe(primera.id);
      // Y entra al final de la fila: su `applied_at` es posterior.
      expect(segunda.appliedAt.getTime()).toBeGreaterThanOrEqual(primera.appliedAt.getTime());
    });

    it("dos personas distintas conviven sin problema", async () => {
      const practiceId = await crearPractica();
      await prisma.practiceApplication.create({
        data: { clubId, practiceId, personId, chukkersOffered: 4 },
      });
      await prisma.practiceApplication.create({
        data: { clubId, practiceId, personId: otraPersonaId, chukkersOffered: 4 },
      });

      expect(await prisma.practiceApplication.count({ where: { practiceId } })).toBe(2);
    });

    it("la misma persona sí puede estar en dos prácticas distintas", async () => {
      const una = await crearPractica();
      const otra = await crearPractica();

      await prisma.practiceApplication.create({
        data: { clubId, practiceId: una, personId, chukkersOffered: 4 },
      });
      await prisma.practiceApplication.create({
        data: { clubId, practiceId: otra, personId, chukkersOffered: 4 },
      });

      expect(
        await prisma.practiceApplication.count({ where: { personId, withdrawnAt: null } }),
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe("los valores por defecto", () => {
    it("una práctica nace en borrador y sin reserva de cancha (R-050-03)", async () => {
      const practiceId = await crearPractica();
      const practica = await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } });

      expect(practica.status).toBe("draft");
      expect(practica.fieldBookingId).toBeNull();
      expect(practica.decidedAt).toBeNull();
    });

    it("una postulación nace sin `outcome`: quién está dentro se calcula hasta que se decide", async () => {
      const practiceId = await crearPractica();
      const postulacion = await prisma.practiceApplication.create({
        data: { clubId, practiceId, personId, chukkersOffered: 4 },
      });

      expect(postulacion.outcome).toBeNull();
      expect(postulacion.withdrawnAt).toBeNull();
    });
  });

  describe("una reserva de cancha pertenece a una sola práctica", () => {
    it("dos prácticas no pueden apuntar a la misma reserva", async () => {
      const reserva = await prisma.fieldBooking.create({
        data: {
          clubId,
          fieldId,
          startsAt: new Date("2026-11-01T21:00:00Z"),
          endsAt: new Date("2026-11-01T23:00:00Z"),
          type: "practice",
          createdById: cuentaId,
        },
      });

      await crearPractica({ fieldBookingId: reserva.id });

      await expect(crearPractica({ fieldBookingId: reserva.id })).rejects.toThrow(
        /Unique constraint/u,
      );
    });
  });

  describe("la habilitación del estudiante se revoca, no se borra (P-06)", () => {
    it("queda quién la otorgó y cuándo, incluso después de revocarla", async () => {
      // Es exactamente lo que hay que poder responder si un estudiante se lastima en una práctica
      // que no le correspondía.
      const habilitacion = await prisma.practiceEligibility.create({
        data: { clubId, personId, maxHandicapHalves: 8, grantedById: cuentaId },
      });

      const revocada = await prisma.practiceEligibility.update({
        where: { id: habilitacion.id },
        data: { revokedAt: new Date("2026-10-05T12:00:00Z"), revokedById: cuentaId },
      });

      expect(revocada.grantedById).toBe(cuentaId);
      expect(revocada.grantedAt).toBeDefined();
      expect(revocada.revokedAt).not.toBeNull();
    });

    it("una persona con habilitación no se puede borrar", async () => {
      await expect(prisma.person.delete({ where: { id: personId } })).rejects.toThrow();
    });
  });
});
