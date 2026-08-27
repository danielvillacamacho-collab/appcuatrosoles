import { Injectable } from "@nestjs/common";
import { grillaInicial, type PuestoDeGrilla } from "@polo/domain";
import type { Prisma } from "@prisma/client";

/**
 * La grilla de chukkers (`specs/052`).
 *
 * Este módulo **no decide nada**: registra lo que pasó. Y por eso es del que dependen los que sí
 * deciden — el cobro por chukker de Fase 3 se alimenta de acá.
 */
@Injectable()
export class GridService {
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
}
