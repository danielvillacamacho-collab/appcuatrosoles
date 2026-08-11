import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { HANDICAP_POR_DEFECTO } from "@polo/domain";
import { etiqueta } from "../db.js";

/**
 * T-320 y T-321 — lo que garantiza la **base**, probado contra la base.
 *
 * Estos tests no pasan por la aplicación a propósito, con el mismo criterio de `specs/040` T-401:
 * lo que se prueba es que el esquema impide lo que dice impedir. Contra un servicio, el día que
 * alguien cambie el servicio el test seguiría pasando y la garantía se habría ido sin que nadie lo
 * notara.
 */
describe("Esquema de handicaps (T-320, T-321)", () => {
  let prisma: PrismaClient;
  let clubId: string;
  let personId: string;
  let cuentaId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: inject("databaseUrl") } } });

    const club = await prisma.club.create({
      data: { slug: `hcap-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club del handicap" },
    });
    clubId = club.id;

    const persona = await prisma.person.create({
      data: { clubId, fullName: "Juan del Handicap" },
    });
    personId = persona.id;

    const cuenta = await prisma.userAccount.create({
      data: {
        personId,
        email: `${etiqueta("hcap")}@ejemplo.test`,
        passwordHash: "argon2id$falso",
        status: "active",
      },
    });
    cuentaId = cuenta.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("un solo vigente por persona y tipo", () => {
    it("el mismo tipo dos veces se rechaza: es lo que hace seguro el upsert del servicio", async () => {
      await prisma.playerHandicap.create({
        data: { clubId, personId, type: "club", valueHalves: 4 },
      });

      await expect(
        prisma.playerHandicap.create({
          data: { clubId, personId, type: "club", valueHalves: 6 },
        }),
      ).rejects.toThrow(/Unique constraint/u);
    });

    it("los dos tipos conviven: son independientes y ninguno se deriva del otro (R-030-01)", async () => {
      await prisma.playerHandicap.create({
        data: { clubId, personId, type: "international", valueHalves: 2 },
      });

      const suyos = await prisma.playerHandicap.findMany({ where: { personId } });

      expect(suyos).toHaveLength(2);
      expect(suyos.map((fila) => fila.type).sort()).toEqual(["club", "international"]);
    });
  });

  describe("la ausencia de fila es un dato (T-321, R-030-05)", () => {
    it("una persona recién creada no tiene NINGUNA fila de handicap", async () => {
      // No se escriben filas al dar de alta a alguien: el módulo entero depende de esto.
      const recien = await prisma.person.create({ data: { clubId, fullName: "Recién llegada" } });

      expect(await prisma.playerHandicap.count({ where: { personId: recien.id } })).toBe(0);
      expect(await prisma.handicapHistory.count({ where: { personId: recien.id } })).toBe(0);
    });

    it("y su valor por defecto es −2 goles, que es un handicap real", async () => {
      expect(HANDICAP_POR_DEFECTO).toBe(-4);
    });

    it("las dos señales van juntas: sin fila vigente, sin historial", async () => {
      // Es la equivalencia de la que depende `plan.md` §2. Si un día alguien escribiera el vigente
      // sin el historial, este test seguiría pasando pero T-331 fallaría — por eso existen los dos.
      const sinCalificar = await prisma.person.findMany({
        where: { clubId, handicaps: { none: {} } },
        select: { id: true, _count: { select: { handicapChanges: true } } },
      });

      for (const persona of sinCalificar) {
        expect(persona._count.handicapChanges).toBe(0);
      }
    });
  });

  describe("el rango NO se valida en la base, y es a propósito", () => {
    it("la base acepta un 999: esa regla es de polo y vive en el dominio (P-01)", async () => {
      // Documenta la decisión de `plan.md` §1. Duplicar el rango en SQL crearía dos verdades
      // capaces de desincronizarse, y la de SQL no se puede probar sin base. Lo que impide que un
      // 999 llegue aquí es `validarHandicap`, probado en `packages/domain`.
      const otra = await prisma.person.create({ data: { clubId, fullName: "Fuera de rango" } });
      const guardado = await prisma.playerHandicap.create({
        data: { clubId, personId: otra.id, type: "club", valueHalves: 999 },
      });

      expect(guardado.valueHalves).toBe(999);
    });
  });

  describe("el historial", () => {
    it("guarda el anterior, el nuevo, el autor y el motivo", async () => {
      const registro = await prisma.handicapHistory.create({
        data: {
          clubId,
          personId,
          type: "club",
          previousHalves: 4,
          newHalves: 5,
          changedById: cuentaId,
          reason: "buen semestre",
        },
      });

      expect(registro.previousHalves).toBe(4);
      expect(registro.newHalves).toBe(5);
      expect(registro.reason).toBe("buen semestre");
      expect(registro.seasonId).toBeNull();
      // Previsto y sin usar hasta que exista la delegación (`docs/09` Q-11).
      expect(registro.onBehalfOfId).toBeNull();
    });

    it("un cambio sin temporada se registra igual: la falta de una no bloquea una decisión deportiva", async () => {
      // R-030-12. El club puede no tener temporada abierta y el comisario decidir igual.
      const sinTemporada = await prisma.handicapHistory.create({
        data: {
          clubId,
          personId,
          type: "international",
          previousHalves: 2,
          newHalves: 3,
          changedById: cuentaId,
          reason: "sin temporada abierta",
        },
      });

      expect(sinTemporada.id).toBeDefined();
    });

    it("una persona con historial no se puede borrar: nada se borra, se archiva (P-06)", async () => {
      await expect(prisma.person.delete({ where: { id: personId } })).rejects.toThrow();
    });

    it("se lee del más nuevo al más viejo", async () => {
      const historial = await prisma.handicapHistory.findMany({
        where: { personId, type: "club" },
        orderBy: { changedAt: "desc" },
      });

      for (let i = 1; i < historial.length; i += 1) {
        const anterior = historial[i - 1];
        const actual = historial[i];

        expect(anterior?.changedAt.getTime()).toBeGreaterThanOrEqual(actual?.changedAt.getTime() ?? 0);
      }
    });
  });
});
