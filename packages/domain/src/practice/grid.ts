import { err, ok, type Result } from "../shared/result.js";

/** Uno de los dos equipos de una práctica. Es una **coordenada**, no una referencia a una fila. */
export type Equipo = "A" | "B";

/**
 * Un lugar de la grilla, ocupado o no (`specs/052`).
 *
 * `personId` nulo es un **hueco**: ese puesto no lo jugó nadie ese chukker. No es una celda que
 * falte — la celda existe, y por eso se puede volver a llenar con un toque.
 */
export interface Celda {
  chukker: number;
  equipo: Equipo;
  position: number;
  personId: string | null;
}

/** Un puesto ya aprobado, tal como lo dejó `051`. */
export interface PuestoDeGrilla {
  equipo: Equipo;
  position: number;
  /** Quién ocupa el puesto. En un puesto compartido, el titular (R-052-08). */
  personId: string;
}

/**
 * La grilla que se espera antes de que pase nada (`specs/052` R-052-01).
 *
 * **Todos juegan todos los chukkers, cada uno en su puesto.** Es lo que ocurre en una práctica
 * normal, y por eso la grilla nace así: el comisario sólo tiene que tocar las excepciones, y una
 * práctica sin excepciones no le cuesta ni un toque.
 *
 * En un puesto de medio hombre las celdas nacen a nombre del **titular**, no repartidas entre los
 * dos. Quién de los dos entra en cada chukker es exactamente lo que el comisario va a corregir, y
 * el sistema no tiene con qué adivinarlo: repartirlas por la mitad sería inventar un dato con
 * apariencia de hecho.
 */
export function grillaInicial(
  puestos: readonly PuestoDeGrilla[],
  chukkers: number,
): readonly Celda[] {
  const celdas: Celda[] = [];

  for (let chukker = 1; chukker <= chukkers; chukker += 1) {
    for (const puesto of puestos) {
      celdas.push({
        chukker,
        equipo: puesto.equipo,
        position: puesto.position,
        personId: puesto.personId,
      });
    }
  }

  return celdas;
}

/**
 * Cuántos chukkers jugó cada quien (R-052-02).
 *
 * **Se cuenta de las celdas y de ningún otro lado.** No hay un total guardado que pueda divergir:
 * un número guardado y una grilla editable se contradicen el primer día, y éste es el número del
 * que va a colgar el cobro de Fase 3.
 *
 * Quien no tiene ninguna celda **no aparece en el resultado**, que no es lo mismo que aparecer en
 * cero. «No jugó» y «no estaba» son cosas distintas, y quien pregunte necesita poder distinguirlas.
 */
export function chukkersPorPersona(celdas: readonly Celda[]): ReadonlyMap<string, number> {
  const cuenta = new Map<string, number>();

  for (const celda of celdas) {
    if (celda.personId !== null) {
      cuenta.set(celda.personId, (cuenta.get(celda.personId) ?? 0) + 1);
    }
  }

  return cuenta;
}

export interface ErrorDeGrilla {
  motivo: "repetido_en_el_chukker";
  /** Quién está dos veces, y dónde. Sin esto habría que buscarlo a mano en 64 celdas. */
  personId: string;
  chukker: number;
}

/**
 * Nadie juega dos veces el mismo chukker (R-052-04).
 *
 * Es la única invariante que la grilla no puede violar ni siquiera a mano, porque hace **imposible
 * contar**: si alguien aparece dos veces en el chukker 4, su total deja de significar nada, y con
 * él el cobro.
 *
 * Se comprueba **entre los dos equipos, no dentro de cada uno**. Una persona en el equipo A y en el
 * B en el mismo chukker es el caso que de verdad ocurre —al sustituir a alguien y olvidar sacarlo
 * de donde estaba— y el que se escaparía si se mirara equipo por equipo.
 *
 * En la base hay un `UNIQUE` que dice lo mismo. Esta función existe para poder rechazar el lote
 * **entero** con un mensaje que se entienda, en vez de dejar que reviente una restricción.
 */
export function validarGrilla(celdas: readonly Celda[]): Result<void, ErrorDeGrilla> {
  const vistos = new Set<string>();

  for (const celda of celdas) {
    if (celda.personId === null) {
      // Los huecos no compiten entre sí: puede haber varios en el mismo chukker.
      continue;
    }

    const clave = `${celda.chukker}:${celda.personId}`;

    if (vistos.has(clave)) {
      return err({
        motivo: "repetido_en_el_chukker",
        personId: celda.personId,
        chukker: celda.chukker,
      });
    }

    vistos.add(clave);
  }

  return ok(undefined);
}

/** El estado de la práctica que le importa al cierre. */
export interface PracticaParaCerrar {
  estado: string;
  startsAt: Date;
}

export type RechazoDeCierre =
  /** Registrar como jugado algo que todavía no ocurrió (R-052-07). */
  | "todavia_no_empezo"
  /** Sólo se cierra lo que se confirmó: una cancelada no se jugó. */
  | "no_esta_confirmada"
  /** Ya está cerrada. Para cambiarla hay que reabrirla, que es un acto aparte y auditado. */
  | "ya_cerrada";

/**
 * Si la práctica se puede cerrar (R-052-07).
 *
 * **Contra el reloj inyectado, nunca contra `new Date()`** (P-08). Que el cierre dependa de la hora
 * es justamente lo que hace que tenga que ser comprobable: un test fija el reloj y mueve la hora, y
 * no hay forma de escribirlo si el dominio mira el sistema.
 */
export function puedeCerrar(
  practica: PracticaParaCerrar,
  ahora: Date,
): Result<void, RechazoDeCierre> {
  if (practica.estado === "played") {
    return err("ya_cerrada");
  }

  if (practica.estado !== "confirmed") {
    return err("no_esta_confirmada");
  }

  if (ahora.getTime() < practica.startsAt.getTime()) {
    return err("todavia_no_empezo");
  }

  return ok(undefined);
}
