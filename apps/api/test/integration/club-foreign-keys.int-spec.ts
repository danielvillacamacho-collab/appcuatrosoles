import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { crearClienteDePrueba, crearClubDePrueba, etiqueta } from "../db.js";

/**
 * T-202 · Las llaves foráneas hacia `club` y `organization` que `specs/010` dejó anotadas como
 * deuda en el propio `schema.prisma`.
 *
 * Hasta esta migración, `club_id` era texto libre: nada impedía una fila que apuntara a un club
 * inexistente, y eso toca directamente P-05 — una fila así no pertenece a ningún inquilino, así
 * que ningún filtro por club la encuentra y ninguna consulta la muestra. Existe, y es invisible.
 */
describe("Integridad referencial hacia club y organización", () => {
  const prisma: PrismaClient = crearClienteDePrueba();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("una persona no puede pertenecer a un club que no existe", async () => {
    await expect(
      prisma.person.create({
        data: { clubId: "club-que-no-existe", fullName: "Fantasma" },
      }),
    ).rejects.toThrow();
  });

  it("una categoría de membresía tampoco", async () => {
    await expect(
      prisma.membershipCategory.create({
        data: {
          clubId: "club-que-no-existe",
          code: etiqueta("cat"),
          name: "Categoría huérfana",
          monthlyFeeCents: 0n,
          rights: {},
        },
      }),
    ).rejects.toThrow();
  });

  it("un vínculo con una organización inexistente se rechaza", async () => {
    const clubId = await crearClubDePrueba(prisma);
    const persona = await prisma.person.create({
      data: { clubId, fullName: "Alumna" },
    });

    await expect(
      prisma.personOrganization.create({
        data: {
          clubId,
          personId: persona.id,
          organizationId: "organizacion-que-no-existe",
          relationship: "student",
          joinedOn: new Date("2026-01-01"),
        },
      }),
    ).rejects.toThrow();
  });

  it("no se puede borrar un club con gente adentro: la historia no se va en cascada (P-06)", async () => {
    const clubId = await crearClubDePrueba(prisma);
    await prisma.person.create({ data: { clubId, fullName: "Socia" } });

    await expect(prisma.club.delete({ where: { id: clubId } })).rejects.toThrow();
  });

  describe("audit_log: append-only y con llave foránea a la vez", () => {
    it("acepta una entrada de un club que existe", async () => {
      const clubId = await crearClubDePrueba(prisma);

      const fila = await prisma.auditLog.create({
        data: {
          clubId,
          action: "club.created",
          entityType: "club",
          entityId: clubId,
          requestId: etiqueta("req"),
        },
      });

      expect(fila.id).toEqual(expect.any(String));
    });

    it("acepta una entrada SIN club: son las acciones de ámbito de plataforma", async () => {
      const fila = await prisma.auditLog.create({
        data: {
          clubId: null,
          action: "platform.club.created",
          entityType: "club",
          entityId: etiqueta("entidad"),
          requestId: etiqueta("req"),
        },
      });

      expect(fila.clubId).toBeNull();
    });

    it("rechaza una entrada de un club inexistente: un rastro ilegible no es un rastro", async () => {
      await expect(
        prisma.auditLog.create({
          data: {
            clubId: "club-que-no-existe",
            action: "user.created",
            entityType: "user_account",
            entityId: etiqueta("entidad"),
            requestId: etiqueta("req"),
          },
        }),
      ).rejects.toThrow();
    });

    it("sigue siendo append-only: la llave foránea no aflojó la garantía de T-004 (P-07)", async () => {
      // Es la comprobación que justifica la decisión de T-202. Agregar la restricción es un ALTER
      // que **lee** las filas para validarlas, no un UPDATE, así que convive con los triggers. Si
      // alguien un día "arregla" esto reemplazando los triggers por otra cosa, este test avisa.
      const clubId = await crearClubDePrueba(prisma);
      const fila = await prisma.auditLog.create({
        data: {
          clubId,
          action: "user.suspended",
          entityType: "user_account",
          entityId: etiqueta("entidad"),
          requestId: etiqueta("req"),
        },
      });

      await expect(
        prisma.auditLog.updateMany({ where: { id: fila.id }, data: { action: "otra" } }),
      ).rejects.toThrow();
      await expect(prisma.auditLog.deleteMany({ where: { id: fila.id } })).rejects.toThrow();
    });
  });
});
