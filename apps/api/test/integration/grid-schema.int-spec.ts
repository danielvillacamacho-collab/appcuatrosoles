import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { etiqueta } from "../db.js";

/**
 * T-711 y T-712 — lo que garantiza la **base**, probado contra la base.
 *
 * No pasan por la aplicación a propósito, con el criterio de `specs/040` T-401: lo que se prueba es
 * que el esquema impide lo que dice impedir. Contra un servicio, el día que alguien cambie el
 * servicio el test seguiría pasando y la garantía se habría ido sin que nadie lo notara.
 */
describe("Esquema de la grilla (T-711, T-712)", () => {
  let prisma: PrismaClient;
  let clubId: string;
  let fieldId: string;
  let cuentaId: string;
  let personas: string[] = [];

  async function crearPractica(): Promise<string> {
    const practica = await prisma.practice.create({
      data: {
        clubId,
        fieldId,
        startsAt: new Date("2027-12-01T16:00:00Z"),
        endsAt: new Date("2027-12-01T18:00:00Z"),
        chukkers: 6,
        handicapType: "club",
        targetPlayers: 4,
        minPlayers: 4,
        applicationsCloseAt: new Date("2027-12-01T12:00:00Z"),
        decisionAt: new Date("2027-12-01T13:00:00Z"),
        status: "confirmed",
        createdById: cuentaId,
      },
      select: { id: true },
    });

    return practica.id;
  }

  function celda(
    practiceId: string,
    chukkerNo: number,
    team: "A" | "B",
    position: number,
    personId: string | null,
  ): { clubId: string; practiceId: string; chukkerNo: number; team: "A" | "B"; position: number; personId: string | null } {
    return { clubId, practiceId, chukkerNo, team, position, personId };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: inject("databaseUrl") } } });

    const club = await prisma.club.create({
      data: { slug: `gr-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club de la grilla" },
    });
    clubId = club.id;

    fieldId = (await prisma.field.create({ data: { clubId, name: "Cancha 1" } })).id;

    const persona = await prisma.person.create({ data: { clubId, fullName: "Creador" } });
    cuentaId = (
      await prisma.userAccount.create({
        data: {
          personId: persona.id,
          email: `${etiqueta("gr")}@ejemplo.test`,
          passwordHash: "argon2id$falso",
          status: "active",
        },
      })
    ).id;

    personas = [persona.id];

    for (let i = 0; i < 3; i += 1) {
      const otra = await prisma.person.create({ data: { clubId, fullName: `Jugador ${i}` } });
      personas.push(otra.id);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("la misma persona NO puede jugar dos veces el mismo chukker (R-052-04)", async () => {
    const practiceId = await crearPractica();
    const ana = personas[0] ?? "";

    await prisma.chukkerGridCell.create({ data: celda(practiceId, 4, "A", 1, ana) });

    await expect(
      prisma.chukkerGridCell.create({ data: celda(practiceId, 4, "A", 2, ana) }),
    ).rejects.toThrow(/Unique constraint/u);
  });

  it("tampoco en el OTRO equipo, que es el caso que de verdad ocurre", async () => {
    // Sustituir a alguien y olvidar sacarlo de donde estaba. Es el error que un `UNIQUE` por equipo
    // dejaría pasar.
    const practiceId = await crearPractica();
    const ana = personas[0] ?? "";

    await prisma.chukkerGridCell.create({ data: celda(practiceId, 4, "A", 1, ana) });

    await expect(
      prisma.chukkerGridCell.create({ data: celda(practiceId, 4, "B", 1, ana) }),
    ).rejects.toThrow(/Unique constraint/u);
  });

  it("varios HUECOS en el mismo chukker sí se aceptan", async () => {
    // PostgreSQL trata los nulos como distintos entre sí en un índice único. De eso depende que se
    // pueda vaciar más de una celda del mismo chukker, y es la clase de cosa que alguien
    // «arreglaría» sin querer poniendo un NOT NULL.
    const practiceId = await crearPractica();

    await prisma.chukkerGridCell.create({ data: celda(practiceId, 4, "A", 1, null) });
    await prisma.chukkerGridCell.create({ data: celda(practiceId, 4, "A", 2, null) });
    await prisma.chukkerGridCell.create({ data: celda(practiceId, 4, "B", 1, null) });

    const cuantas = await prisma.chukkerGridCell.count({ where: { practiceId, chukkerNo: 4 } });
    expect(cuantas).toBe(3);
  });

  it("la misma persona en chukkers distintos es lo normal", async () => {
    const practiceId = await crearPractica();
    const ana = personas[0] ?? "";

    for (let chukker = 1; chukker <= 6; chukker += 1) {
      await prisma.chukkerGridCell.create({ data: celda(practiceId, chukker, "A", 1, ana) });
    }

    expect(await prisma.chukkerGridCell.count({ where: { practiceId, personId: ana } })).toBe(6);
  });

  it("no hay dos celdas para el mismo lugar de la grilla", async () => {
    const practiceId = await crearPractica();

    await prisma.chukkerGridCell.create({ data: celda(practiceId, 1, "A", 1, personas[0] ?? "") });

    await expect(
      prisma.chukkerGridCell.create({ data: celda(practiceId, 1, "A", 1, personas[1] ?? "") }),
    ).rejects.toThrow(/Unique constraint/u);
  });

  it("REARMAR EQUIPOS NO SE LLEVA LA GRILLA (T-712)", async () => {
    // La razón por la que `team` es una coordenada y no una llave foránea (plan §5). Con la llave,
    // el primer comisario que rearmara equipos se llevaría por delante la grilla entera —por
    // cascada, en silencio, sin un error que lo delatara—.
    const practiceId = await crearPractica();

    const equipo = await prisma.practiceTeam.create({
      data: { clubId, practiceId, label: "A", handicapTotalHalves: 8 },
      select: { id: true },
    });

    for (let chukker = 1; chukker <= 6; chukker += 1) {
      await prisma.chukkerGridCell.create({
        data: celda(practiceId, chukker, "A", 1, personas[0] ?? ""),
      });
    }

    // Rearmar es exactamente esto: `TeamsService.proponer` hace `deleteMany` sobre los equipos.
    await prisma.practiceTeam.delete({ where: { id: equipo.id } });

    expect(
      await prisma.chukkerGridCell.count({ where: { practiceId } }),
      "las celdas sobreviven al rearme porque no cuelgan del equipo",
    ).toBe(6);
  });

  it("borrar la práctica sí se lleva su grilla y su resultado", async () => {
    const practiceId = await crearPractica();

    await prisma.chukkerGridCell.create({ data: celda(practiceId, 1, "A", 1, personas[0] ?? "") });
    await prisma.practiceResult.create({
      data: {
        practiceId,
        clubId,
        teamAGoals: 5,
        teamBGoals: 4,
        recordedById: cuentaId,
        recordedAt: new Date(),
      },
    });

    await prisma.practice.delete({ where: { id: practiceId } });

    expect(await prisma.chukkerGridCell.count({ where: { practiceId } })).toBe(0);
    expect(await prisma.practiceResult.count({ where: { practiceId } })).toBe(0);
  });

  it("una práctica tiene UN resultado, no dos", async () => {
    const practiceId = await crearPractica();
    const resultado = {
      practiceId,
      clubId,
      teamAGoals: 5,
      teamBGoals: 4,
      recordedById: cuentaId,
      recordedAt: new Date(),
    };

    await prisma.practiceResult.create({ data: resultado });

    await expect(prisma.practiceResult.create({ data: resultado })).rejects.toThrow(
      /Unique constraint/u,
    );
  });

  it("`played` existe como estado de una práctica", async () => {
    // El enum se amplió en esta migración. Si el `ADD VALUE` no hubiera aplicado, esto falla acá y
    // no tres tareas más adelante.
    const practiceId = await crearPractica();

    await prisma.practice.update({
      where: { id: practiceId },
      data: { status: "played", closedAt: new Date(), closedById: cuentaId },
    });

    const practica = await prisma.practice.findUniqueOrThrow({
      where: { id: practiceId },
      select: { status: true, closedAt: true, closedById: true },
    });

    expect(practica.status).toBe("played");
    expect(practica.closedAt).not.toBeNull();
    expect(practica.closedById).toBe(cuentaId);
  });
});
