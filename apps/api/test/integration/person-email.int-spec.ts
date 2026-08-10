import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { crearClienteDePrueba, etiqueta } from "../db.js";

/**
 * T-005 · El correo de una persona es único dentro de su club, pero puede estar vacío.
 *
 * Esto era un supuesto del plan que resultó equivocado: se creía que hacía falta un índice
 * parcial en SQL crudo (`WHERE email IS NOT NULL`). No hace falta — PostgreSQL ya trata los
 * `NULL` como distintos en un índice único. Estos tests fijan ese comportamiento para que nadie
 * lo «arregle» más adelante agregando el índice parcial, ni lo rompa cambiando el constraint.
 */
describe("Persona · unicidad del correo dentro del club", () => {
  const prisma: PrismaClient = crearClienteDePrueba();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("dos personas del mismo club pueden tener el correo vacío", async () => {
    const club = etiqueta("club");

    await prisma.person.create({ data: { clubId: club, fullName: "Petisero sin correo" } });
    await prisma.person.create({ data: { clubId: club, fullName: "Invitada sin correo" } });

    const sinCorreo = await prisma.person.count({ where: { clubId: club, email: null } });
    expect(sinCorreo).toBe(2);
  });

  it("dos personas del mismo club NO pueden repetir el mismo correo", async () => {
    const club = etiqueta("club");

    await prisma.person.create({
      data: { clubId: club, fullName: "Primera", email: "repetido@ejemplo.com" },
    });

    await expect(
      prisma.person.create({
        data: { clubId: club, fullName: "Segunda", email: "repetido@ejemplo.com" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("el mismo correo sí puede existir en dos clubes distintos", async () => {
    const clubA = etiqueta("club-a");
    const clubB = etiqueta("club-b");

    await prisma.person.create({
      data: { clubId: clubA, fullName: "Misma persona en A", email: "compartido@ejemplo.com" },
    });
    const enB = await prisma.person.create({
      data: { clubId: clubB, fullName: "Misma persona en B", email: "compartido@ejemplo.com" },
    });

    expect(enB.id).toBeTruthy();
  });

  it("el correo de acceso, en cambio, es único en toda la plataforma (docs/09 D-05)", async () => {
    const clubA = etiqueta("club-a");
    const clubB = etiqueta("club-b");
    const correoDeAcceso = `${etiqueta("acceso")}@ejemplo.com`;

    const personaA = await prisma.person.create({
      data: { clubId: clubA, fullName: "Comisario en A" },
    });
    const personaB = await prisma.person.create({
      data: { clubId: clubB, fullName: "Comisario en B" },
    });

    await prisma.userAccount.create({
      data: { personId: personaA.id, email: correoDeAcceso, passwordHash: "argon2id$placeholder" },
    });

    // A diferencia de `person.email`, éste no se puede repetir ni en otro club: una persona
    // tiene un solo acceso y cambia de club activo dentro de la plataforma.
    await expect(
      prisma.userAccount.create({
        data: {
          personId: personaB.id,
          email: correoDeAcceso,
          passwordHash: "argon2id$placeholder",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
