import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { etiqueta } from "../db.js";

/** T-610 — lo que garantiza la base, probado contra la base. */
describe("Esquema de equipos (T-610)", () => {
  let prisma: PrismaClient;
  let clubId: string;
  let personas: string[];
  let fieldId: string;
  let cuentaId: string;

  /**
   * Una práctica **propia de cada test**.
   *
   * Compartir una sola entre todos parecía más simple y no lo era: la restricción de «un equipo A
   * por práctica» hace que el primer test que crea un equipo le rompa la corrida al siguiente, y el
   * síntoma aparece en el test de más abajo, que no tiene nada que ver.
   */
  async function crearPractica(): Promise<string> {
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("una práctica tiene un equipo A y un equipo B, no dos A", async () => {
    const practiceId = await crearPractica();
    await crearEquipo(practiceId, "A");

    await expect(crearEquipo(practiceId, "A")).rejects.toThrow(/Unique constraint/u);
  });

  it("dos puestos no comparten posición dentro de un equipo", async () => {
    const equipo = await crearEquipo(await crearPractica(), "B");
    const puesto = {
      clubId,
      practiceTeamId: equipo,
      position: 1,
      effectiveHandicapHalves: 4,
    };

    await prisma.practiceSlot.create({ data: { ...puesto, primaryPersonId: personas[0] ?? "" } });

    await expect(
      prisma.practiceSlot.create({ data: { ...puesto, primaryPersonId: personas[1] ?? "" } }),
    ).rejects.toThrow(/Unique constraint/u);
  });

  it("borrar el equipo se lleva sus puestos, y no quedan huérfanos", async () => {
    // Es lo que hace seguro rearmar: se borran los dos equipos y se vuelven a crear.
    const equipo = await prisma.practiceTeam.create({
      data: {
        clubId,
        practiceId: await crearPractica(),
        label: "A",
        handicapTotalHalves: 8,
        slots: {
          create: [
            { clubId, position: 1, primaryPersonId: personas[0] ?? "", effectiveHandicapHalves: 4 },
            { clubId, position: 2, primaryPersonId: personas[1] ?? "", effectiveHandicapHalves: 4 },
          ],
        },
      },
      select: { id: true },
    });

    await prisma.practiceTeam.delete({ where: { id: equipo.id } });

    expect(await prisma.practiceSlot.count({ where: { practiceTeamId: equipo.id } })).toBe(0);
  });

  it("un puesto compartido guarda a los dos y el handicap con que se armó", async () => {
    const equipo = await crearEquipo(await crearPractica(), "B", 8);
    const puesto = await prisma.practiceSlot.create({
      data: {
        clubId,
        practiceTeamId: equipo,
        position: 2,
        primaryPersonId: personas[0] ?? "",
        secondaryPersonId: personas[1] ?? "",
        effectiveHandicapHalves: 8,
      },
    });

    expect(puesto.secondaryPersonId).toBe(personas[1]);
    // Congelado, no una referencia al vigente (`plan.md` §0).
    expect(puesto.effectiveHandicapHalves).toBe(8);
    expect(puesto.costSharePrimaryPct).toBe(50);
  });

  it("un equipo nace SIN aprobar: es un borrador hasta que el comisario decide", async () => {
    const equipo = await prisma.practiceTeam.findUniqueOrThrow({
      where: { id: await crearEquipo(await crearPractica(), "A") },
    });

    expect(equipo.approvedAt).toBeNull();
    expect(equipo.approvedById).toBeNull();
  });

  it("las tablas nuevas nacieron accesibles para el rol de aplicación, sin que nadie lo hiciera", async () => {
    // **La promesa de T-007 comprobada con tablas de verdad.** Los privilegios por defecto son lo
    // que hace mantenible el esquema: si no funcionaran, este archivo entero fallaría con
    // «permission denied» — porque la suite corre como `polo_app`, no como el dueño.
    const [quienSoy] = await prisma.$queryRawUnsafe<{ current_user: string }[]>(
      "SELECT current_user",
    );

    expect(quienSoy?.current_user).toBe("polo_app");
  });
});
