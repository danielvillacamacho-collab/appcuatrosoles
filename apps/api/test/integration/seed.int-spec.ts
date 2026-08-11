import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { CLUB_ID, sembrarClubDemo } from "../../prisma/seed.js";
import { crearClienteDePrueba } from "../db.js";

/**
 * T-006 · El seed tiene que poder correrse dos veces sin duplicar nada.
 *
 * No es un capricho: un seed que exige borrar la base antes de volver a usarlo no se usa, y un
 * seed que no se usa se desactualiza respecto al esquema (docs/05 §8). Este test es la razón por
 * la que `sembrarClubDemo` recibe el cliente en vez de crearlo — así se puede llamar dos veces
 * contra una base de prueba.
 */
describe("Seed del club de ejemplo", () => {
  const prisma: PrismaClient = crearClienteDePrueba();

  const contar = async (): Promise<Record<string, number>> => ({
    personas: await prisma.person.count({ where: { clubId: CLUB_ID } }),
    cuentas: await prisma.userAccount.count({ where: { person: { clubId: CLUB_ID } } }),
    roles: await prisma.roleAssignment.count({ where: { scopeId: CLUB_ID, revokedAt: null } }),
    categorias: await prisma.membershipCategory.count({ where: { clubId: CLUB_ID } }),
    membresias: await prisma.membershipAssignment.count({ where: { clubId: CLUB_ID } }),
    waivers: await prisma.waiverVersion.count({ where: { clubId: CLUB_ID } }),
    clubes: await prisma.club.count({ where: { id: CLUB_ID } }),
    organizaciones: await prisma.organization.count({ where: { clubId: CLUB_ID } }),
    temporadas: await prisma.season.count({ where: { clubId: CLUB_ID } }),
    vinculos: await prisma.personOrganization.count({ where: { clubId: CLUB_ID } }),
  });

  beforeAll(async () => {
    await sembrarClubDemo(prisma, { silencioso: true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deja el club de ejemplo listo para usar", async () => {
    const conteos = await contar();

    expect(conteos.personas).toBe(3);
    expect(conteos.cuentas).toBe(3);
    expect(conteos.roles).toBe(3);
    expect(conteos.categorias).toBe(5);
    expect(conteos.waivers).toBe(1);
    expect(conteos.clubes).toBe(1);
    expect(conteos.organizaciones).toBe(1);
    expect(conteos.temporadas).toBe(1);
    // Las tres personas quedan vinculadas a la organización: sin vínculos, un administrador de
    // organización no tendría sobre qué actuar y R-010-04 no se podría probar con datos reales.
    expect(conteos.vinculos).toBe(3);
  });

  it("el club queda activo y con su subdominio propio, no como los que migró T-202", async () => {
    const club = await prisma.club.findUniqueOrThrow({ where: { id: CLUB_ID } });

    expect(club.status).toBe("active");
    expect(club.slug).toBe("club-demo");
  });

  it("la temporada tiene fechas reales y está abierta (D-020-03)", async () => {
    const temporada = await prisma.season.findFirstOrThrow({ where: { clubId: CLUB_ID } });

    expect(temporada.status).toBe("open");
    expect(temporada.startsOn.toISOString()).toContain("2026-01-01");
    expect(temporada.endsOn.toISOString()).toContain("2026-12-31");
  });

  it("las tres cuentas quedan activas y con un rol distinto cada una", async () => {
    const roles = await prisma.roleAssignment.findMany({
      where: { scopeId: CLUB_ID, revokedAt: null },
      select: { role: true },
    });

    expect(new Set(roles.map((r) => r.role))).toEqual(
      new Set(["club_admin", "commissioner", "player"]),
    );

    const activas = await prisma.userAccount.count({
      where: { person: { clubId: CLUB_ID }, status: "active" },
    });
    expect(activas).toBe(3);
  });

  it("el club de ejemplo tiene sus canchas: sin ellas no se puede programar nada", async () => {
    const canchas = await prisma.field.findMany({
      where: { club: { slug: "club-demo" } },
      orderBy: { name: "asc" },
    });

    expect(canchas.map((cancha) => cancha.name)).toEqual(["Cancha 1", "Cancha 2", "Cancha 3"]);
  });

  it("correrlo una segunda vez no duplica nada", async () => {
    const antes = await contar();

    await sembrarClubDemo(prisma, { silencioso: true });

    expect(await contar()).toEqual(antes);
  });
});
