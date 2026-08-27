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
    practicas: await prisma.practice.count({ where: { clubId: CLUB_ID } }),
    postulaciones: await prisma.practiceApplication.count({ where: { clubId: CLUB_ID } }),
    handicaps: await prisma.playerHandicap.count({ where: { clubId: CLUB_ID } }),
  });

  beforeAll(async () => {
    await sembrarClubDemo(prisma, { silencioso: true });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deja el club de ejemplo listo para usar", async () => {
    const conteos = await contar();

    // **Siete personas y tres cuentas**, y la diferencia es el punto: las tres con cuenta son las
    // que entran a probar —administradora, comisario y jugador—, y las otras cuatro son los
    // jugadores de la práctica de ejemplo, que existen para que haya equipos que armar y **no
    // necesitan iniciar sesión**. Un menor sin cuenta propia es exactamente la misma forma.
    expect(conteos.personas).toBe(7);
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

  it("deja una práctica confirmada con jugadores, para poder ver los equipos", async () => {
    // Sin ella el club de ejemplo no muestra `specs/051`: llegar a una práctica confirmada por el
    // camino normal exige esperar a que corra el proceso de decisión.
    const conteos = await contar();
    const practica = await prisma.practice.findFirstOrThrow({
      where: { clubId: CLUB_ID, status: "confirmed", startsAt: { gt: new Date("2026-10-01") } },
    });

    // **Tres, y cada una cuenta un estado distinto**: la que viene y espera equipos (`051`), la que
    // ya quedó registrada y cerrada (`052`), y la que se jugó y espera que alguien diga qué pasó.
    expect(conteos.practicas).toBe(3);
    expect(practica.status).toBe("confirmed");
    // Cuatro por práctica: las mismas cuatro personas jugaron las tres.
    expect(conteos.postulaciones).toBe(12);
    // Con handicap, o el balanceo no tendría nada que balancear.
    expect(conteos.handicaps).toBe(4);
  });

  it("y la deja SIN equipos armados, a propósito", async () => {
    // Que el club de ejemplo llegue hasta acá y no más lejos es lo que deja ver la pantalla
    // haciendo su trabajo: se entra, se arman, se ajustan y se aprueban.
    const proxima = await prisma.practice.findFirstOrThrow({
      where: { clubId: CLUB_ID, status: "confirmed", startsAt: { gt: new Date("2026-10-01") } },
      select: { id: true },
    });

    expect(await prisma.practiceTeam.count({ where: { practiceId: proxima.id } })).toBe(0);
  });

  it("deja una práctica YA JUGADA y SIN CERRAR, que es la tarea del comisario", async () => {
    // La tercera. Con equipos aprobados y la grilla llena: lo que hay que hacer con ella es
    // corregir lo que no salió como estaba previsto, y cerrarla.
    const porCerrar = await prisma.practice.findFirstOrThrow({
      where: { clubId: CLUB_ID, status: "confirmed", startsAt: { lt: new Date("2026-10-01") } },
      select: { id: true, startsAt: true },
    });

    expect(
      porCerrar.startsAt.getTime(),
      "tiene que estar en el pasado o no se podrá cerrar (R-052-07)",
    ).toBeLessThan(new Date("2026-08-27T00:00:00Z").getTime());

    expect(await prisma.practiceTeam.count({ where: { practiceId: porCerrar.id } })).toBe(2);
    expect(await prisma.chukkerGridCell.count({ where: { practiceId: porCerrar.id } })).toBe(24);
  });

  it("deja además una práctica YA JUGADA con su grilla (T-744)", async () => {
    // Sirve a otra cosa que la anterior: la de arriba deja ver el módulo de equipos funcionando;
    // ésta deja ver el resultado de haberlo usado. Sin ella, la pantalla del jugador —«¿me
    // contaron bien?»— no tiene nada que mostrar el primer día.
    const jugada = await prisma.practice.findFirstOrThrow({
      where: { clubId: CLUB_ID, status: "played" },
      select: { id: true, closedAt: true, closedById: true },
    });

    expect(jugada.closedAt).not.toBeNull();
    expect(jugada.closedById).not.toBeNull();
    // 4 puestos × 6 chukkers.
    expect(await prisma.chukkerGridCell.count({ where: { practiceId: jugada.id } })).toBe(24);
  });

  it("y la grilla trae UNA corrección, porque una perfecta no enseña nada", async () => {
    // La pregunta que la pantalla del jugador responde sólo aparece cuando la cuenta de alguien no
    // es la esperada. Caro jugó 5 de 6: se le lastimó un caballo en el quinto.
    const jugada = await prisma.practice.findFirstOrThrow({
      where: { clubId: CLUB_ID, status: "played" },
      select: { id: true },
    });
    const caro = await prisma.person.findFirstOrThrow({
      where: { clubId: CLUB_ID, fullName: "Caro Ejemplo" },
      select: { id: true },
    });

    expect(
      await prisma.chukkerGridCell.count({
        where: { practiceId: jugada.id, personId: caro.id },
      }),
    ).toBe(5);

    expect(
      await prisma.chukkerGridCell.count({
        where: { practiceId: jugada.id, personId: null },
      }),
      "el hueco existe: la celda no se borra, se vacía",
    ).toBe(1);
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
