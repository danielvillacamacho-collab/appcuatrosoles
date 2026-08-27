import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import type { AdjustGridRequest, NoShowRequest, PracticeGridResponse } from "@polo/contracts";
import {
  chukkersPorPersona,
  grillaInicial,
  validarGrilla,
  type Celda,
  type PuestoDeGrilla,
} from "@polo/domain";
import type { Prisma } from "@prisma/client";
import { ApiException } from "../common/errors/api-error.js";
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

  /**
   * Corregir la grilla: un lote de cambios, **todo o nada** (T-723).
   *
   * El lote es atómico **por R-052-04, no por concurrencia**. Intercambiar dos jugadores del mismo
   * chukker sólo es posible si los dos cambios entran juntos: por separado, el primero choca contra
   * el `UNIQUE` porque el otro todavía está donde estaba.
   *
   * De ahí las **dos pasadas**. Primero se vacían todas las celdas que el lote toca, después se
   * llenan. Es el mismo escalón que `051` T-632 con `(team, position)`, y la misma solución: un
   * estado intermedio que la base no acepta se evita pasando por uno que sí —el vacío—.
   */
  async ajustar(
    clubId: string,
    practiceId: string,
    peticion: AdjustGridRequest,
  ): Promise<PracticeGridResponse> {
    await this.prisma.$transaction(async (tx) => {
      // El candado primero, con la lección de `030` T-332: `READ COMMITTED` no serializa por leer
      // dentro de la transacción, así que sin esto un cierre en curso y este ajuste se pisan.
      await tx.$queryRaw`SELECT id FROM "practice" WHERE id = ${practiceId} AND club_id = ${clubId} FOR UPDATE`;

      const practica = await tx.practice.findFirst({
        where: { id: practiceId, clubId },
        select: { status: true },
      });

      if (practica === null) {
        throw new NotFoundException();
      }

      if (practica.status === "played") {
        throw new ApiException(
          "practica_cerrada",
          HttpStatus.CONFLICT,
          "La práctica está cerrada. Para corregir la grilla hay que reabrirla.",
        );
      }

      const celdas = await tx.chukkerGridCell.findMany({
        where: { practiceId, clubId },
        select: { id: true, chukkerNo: true, team: true, position: true, personId: true },
      });

      if (celdas.length === 0) {
        throw new NotFoundException();
      }

      const porLugar = new Map(
        celdas.map((celda) => [`${celda.chukkerNo}:${celda.team}:${celda.position}`, celda]),
      );

      // Quién puede ir en una celda: cualquier persona activa **de este club** (R-052-05), y que no
      // esté marcada como ausente (R-052-03).
      const aColocar = [
        ...new Set(
          peticion.cambios.flatMap((cambio) =>
            cambio.personId === null ? [] : [cambio.personId],
          ),
        ),
      ];

      if (aColocar.length > 0) {
        const validas = await tx.person.findMany({
          where: { id: { in: aColocar }, clubId, status: "active" },
          select: { id: true },
        });

        if (validas.length !== aColocar.length) {
          throw new ApiException(
            "persona_invalida",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Sólo se puede poner en la grilla a una persona activa del club.",
          );
        }

        const ausentes = await tx.practiceApplication.findMany({
          where: { practiceId, clubId, personId: { in: aColocar }, outcome: "no_show" },
          select: { personId: true },
        });

        if (ausentes.length > 0) {
          throw new ApiException(
            "marcado_ausente",
            HttpStatus.CONFLICT,
            "Esa persona está marcada como que no se presentó. Quita la marca antes de ponerla en la grilla.",
          );
        }
      }

      // Cómo queda la grilla si el lote entra. Se valida **antes de escribir** para poder rechazar
      // con un mensaje que se entienda, en vez de dejar que reviente una restricción.
      const resultante = new Map(
        celdas.map((celda) => [
          celda.id,
          {
            chukker: celda.chukkerNo,
            equipo: celda.team,
            position: celda.position,
            personId: celda.personId,
          } satisfies Celda,
        ]),
      );

      const tocadas: string[] = [];

      for (const cambio of peticion.cambios) {
        const celda = porLugar.get(`${cambio.chukker}:${cambio.equipo}:${cambio.position}`);

        if (celda === undefined) {
          throw new ApiException(
            "celda_inexistente",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Ese lugar no existe en la grilla de esta práctica.",
          );
        }

        const actual = resultante.get(celda.id);

        if (actual !== undefined) {
          resultante.set(celda.id, { ...actual, personId: cambio.personId });
        }

        tocadas.push(celda.id);
      }

      const valida = validarGrilla([...resultante.values()]);

      if (!valida.ok) {
        throw new ApiException(
          "repetido_en_el_chukker",
          HttpStatus.UNPROCESSABLE_ENTITY,
          `No se puede: esa persona quedaría dos veces en el chukker ${String(valida.error.chukker)}.`,
          { personId: valida.error.personId, chukker: valida.error.chukker },
        );
      }

      // Primera pasada: vaciar lo que el lote toca. Sin esto, un intercambio choca contra el
      // `UNIQUE` en el estado intermedio.
      await tx.chukkerGridCell.updateMany({
        where: { id: { in: tocadas } },
        data: { personId: null },
      });

      // Segunda pasada: los valores definitivos.
      for (const id of new Set(tocadas)) {
        const celda = resultante.get(id);

        if (celda !== undefined && celda.personId !== null) {
          await tx.chukkerGridCell.update({
            where: { id },
            data: { personId: celda.personId },
          });
        }
      }
    });

    return this.ver(clubId, practiceId);
  }

  /**
   * Quien no se presentó (T-724, R-052-03).
   *
   * **Marcar vacía sus celdas, en la misma transacción.** Es la conveniencia entera de HU-052-04:
   * un toque en vez de seis. Y es lo que sostiene la invariante, porque no hay restricción de base
   * que pueda cruzar dos tablas: `no_show` y tener celdas no pueden ser ciertas a la vez, así que
   * marcar tiene que dejar la grilla coherente o la invariante es una frase en un documento.
   *
   * La otra dirección la cubre `ajustar`: estando marcado, no se puede ocupar una celda.
   *
   * **Desmarcar no restaura las celdas.** El sistema no sabe qué chukkers jugó; devolverle los seis
   * originales sería inventar justo el dato que este módulo existe para registrar.
   */
  async marcarAusente(
    clubId: string,
    practiceId: string,
    peticion: NoShowRequest,
  ): Promise<PracticeGridResponse> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "practice" WHERE id = ${practiceId} AND club_id = ${clubId} FOR UPDATE`;

      const practica = await tx.practice.findFirst({
        where: { id: practiceId, clubId },
        select: { status: true },
      });

      if (practica === null) {
        throw new NotFoundException();
      }

      if (practica.status === "played") {
        throw new ApiException(
          "practica_cerrada",
          HttpStatus.CONFLICT,
          "La práctica está cerrada. Para corregirla hay que reabrirla.",
        );
      }

      const postulacion = await tx.practiceApplication.findFirst({
        where: { practiceId, clubId, personId: peticion.personId, withdrawnAt: null },
        select: { id: true, outcome: true },
      });

      if (postulacion === null) {
        throw new NotFoundException();
      }

      if (peticion.ausente && postulacion.outcome !== "accepted") {
        // No se presentó quien nunca fue esperado: marcar a alguien que quedó en lista de espera
        // ensuciaría la estadística sin describir nada real.
        throw new ApiException(
          "no_estaba_aceptado",
          HttpStatus.CONFLICT,
          "Sólo se marca como ausente a quien había quedado dentro de la práctica.",
        );
      }

      if (!peticion.ausente && postulacion.outcome !== "no_show") {
        throw new ApiException(
          "no_estaba_marcado",
          HttpStatus.CONFLICT,
          "Esa persona no está marcada como ausente.",
        );
      }

      await tx.practiceApplication.update({
        where: { id: postulacion.id },
        data: { outcome: peticion.ausente ? "no_show" : "accepted" },
      });

      if (peticion.ausente) {
        await tx.chukkerGridCell.updateMany({
          where: { practiceId, clubId, personId: peticion.personId },
          data: { personId: null },
        });
      }
    });

    return this.ver(clubId, practiceId);
  }
}
