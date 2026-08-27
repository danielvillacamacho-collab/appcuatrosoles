import { Injectable, NotFoundException } from "@nestjs/common";
import type { PracticeGridResponse } from "@polo/contracts";
import { chukkersPorPersona, grillaInicial, type Celda, type PuestoDeGrilla } from "@polo/domain";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service.js";

/**
 * La grilla de chukkers (`specs/052`).
 *
 * Este módulo **no decide nada**: registra lo que pasó. Y por eso es del que dependen los que sí
 * deciden — el cobro por chukker de Fase 3 se alimenta de acá.
 */
@Injectable()
export class GridService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La grilla nace al aprobarse los equipos (T-721, R-052-01).
   *
   * **Recibe la transacción, no la abre.** Va dentro de la de `TeamsService.aprobar` por la razón de
   * `051` T-621 aplicada otra vez: con dos transacciones separadas, un proceso que muera entre una
   * y otra deja una práctica con equipos aprobados y sin grilla, y **esa práctica no se puede cerrar
   * nunca**. Que la aprobación se caiga si la grilla falla es el comportamiento correcto.
   *
   * **Sólo la primera vez.** Aprobar se puede repetir —`051` lo permite a propósito, porque una
   * práctica se reacomoda hasta último momento— y si ya hay celdas se dejan como están. Rehacerlas
   * borraría las correcciones que el comisario hizo a mano, que es lo único que no perdonaría.
   */
  async crearEn(
    tx: Prisma.TransactionClient,
    clubId: string,
    practiceId: string,
  ): Promise<number> {
    const yaHay = await tx.chukkerGridCell.count({ where: { practiceId } });

    if (yaHay > 0) {
      return 0;
    }

    const practica = await tx.practice.findUniqueOrThrow({
      where: { id: practiceId },
      select: { chukkers: true },
    });

    const equipos = await tx.practiceTeam.findMany({
      where: { practiceId, clubId },
      select: {
        label: true,
        slots: { select: { position: true, primaryPersonId: true } },
      },
    });

    const puestos: PuestoDeGrilla[] = equipos.flatMap((equipo) =>
      equipo.slots.map((puesto) => ({
        equipo: equipo.label,
        position: puesto.position,
        // El titular. En un puesto de medio hombre, quién de los dos entra en cada chukker es lo
        // que el comisario va a corregir (R-052-08): el sistema no tiene con qué adivinarlo.
        personId: puesto.primaryPersonId,
      })),
    );

    const celdas = grillaInicial(puestos, practica.chukkers);

    if (celdas.length === 0) {
      return 0;
    }

    await tx.chukkerGridCell.createMany({
      data: celdas.map((celda) => ({
        clubId,
        practiceId,
        chukkerNo: celda.chukker,
        team: celda.equipo,
        position: celda.position,
        personId: celda.personId,
      })),
    });

    return celdas.length;
  }

  /**
   * La grilla, con la cuenta de cada quien (T-722).
   *
   * **La ve cualquiera con sesión en el club**, sin permiso especial. No hay nada sensible: los
   * equipos ya son públicos desde que se aprobaron, y esconderla obligaría a un jugador a preguntar
   * por WhatsApp cuántos chukkers jugó — justo el problema que el módulo viene a resolver.
   *
   * Una práctica sin equipos aprobados no tiene grilla, y responde 404 igual que una de otro club
   * (P-05): decir «existe pero está vacía» no le sirve a nadie y sí cuenta algo.
   */
  async ver(clubId: string, practiceId: string): Promise<PracticeGridResponse> {
    const practica = await this.prisma.practice.findFirst({
      where: { id: practiceId, clubId },
      select: {
        chukkers: true,
        status: true,
        result: { select: { teamAGoals: true, teamBGoals: true, notes: true } },
      },
    });

    if (practica === null) {
      throw new NotFoundException();
    }

    const filas = await this.prisma.chukkerGridCell.findMany({
      where: { practiceId, clubId },
      orderBy: [{ chukkerNo: "asc" }, { team: "asc" }, { position: "asc" }],
      select: {
        chukkerNo: true,
        team: true,
        position: true,
        personId: true,
        person: { select: { id: true, fullName: true } },
      },
    });

    if (filas.length === 0) {
      throw new NotFoundException();
    }

    const celdas: Celda[] = filas.map((fila) => ({
      chukker: fila.chukkerNo,
      equipo: fila.team,
      position: fila.position,
      personId: fila.personId,
    }));

    const cuenta = chukkersPorPersona(celdas);
    const nombres = new Map(
      filas.flatMap((fila) => (fila.person === null ? [] : [[fila.person.id, fila.person.fullName]])),
    );

    // Quien fue aceptado y no se presentó **no tiene celdas**, así que no saldría de la cuenta. Se
    // agrega explícitamente: «no jugó» es un dato que alguien tiene que poder ver.
    const ausentes = await this.prisma.practiceApplication.findMany({
      where: { practiceId, clubId, outcome: "no_show" },
      select: { personId: true, person: { select: { fullName: true } } },
    });

    return {
      chukkers: practica.chukkers,
      cerrada: practica.status === "played",
      celdas: filas.map((fila) => ({
        chukker: fila.chukkerNo,
        equipo: fila.team,
        position: fila.position,
        persona:
          fila.person === null
            ? null
            : { personId: fila.person.id, fullName: fila.person.fullName },
      })),
      chukkersPorPersona: [
        ...[...cuenta.entries()].map(([personId, chukkers]) => ({
          personId,
          fullName: nombres.get(personId) ?? "",
          chukkers,
          noSePresento: false,
        })),
        ...ausentes.map((ausente) => ({
          personId: ausente.personId,
          fullName: ausente.person.fullName,
          chukkers: 0,
          noSePresento: true,
        })),
      ].sort((a, b) => b.chukkers - a.chukkers || a.fullName.localeCompare(b.fullName)),
      resultado:
        practica.result === null
          ? null
          : {
              golesA: practica.result.teamAGoals,
              golesB: practica.result.teamBGoals,
              notas: practica.result.notes,
            },
    };
  }
}
