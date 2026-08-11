import { err, ok, type Result } from "../shared/result.js";

/**
 * Un handicap válido, en **medios goles enteros** (constitución, regla 4).
 *
 * Handicap 1.5 es `3`. Handicap −2 es `-4`. Rango: −4 a 20.
 *
 * **Por qué está marcado y `LocalDate` no.** Los dos son alias de un primitivo, pero el error que
 * evitan es de naturaleza distinta. Una `LocalDate` mal construida se ve mal —`"hoy"` no se parece
 * a una fecha— y explota en la primera comparación. Un handicap mal construido **es un número que
 * se ve perfecto**: si alguien pasa `1.5` donde van medios goles, o se olvida de multiplicar por
 * dos, el resultado es un jugador de handicap 0.75 que nadie nota hasta que los equipos quedan
 * desparejos y no hay a qué culpar. La marca hace que ese error no compile.
 *
 * Se construye **sólo** con `validarHandicap` o `goalsToHalves`.
 */
export type HandicapHalves = number & { readonly __handicap: unique symbol };

/** Por qué se rechazó un valor. Distinguibles para que la interfaz explique cuál falló. */
export type HandicapInvalido =
  /** Fuera de −2 a 10 goles: no es un handicap que exista en el polo. */
  | "fuera_de_rango"
  /** El handicap se mueve en medios goles: 1.5 sí, 1.3 no. */
  | "no_es_medio_gol";

/** −2 goles. El más bajo que existe, y el que rige mientras nadie califique (`specs/030` R-030-05). */
export const HANDICAP_MINIMO_HALVES = -4;
/** 10 goles. Los mejores del mundo. */
export const HANDICAP_MAXIMO_HALVES = 20;

/**
 * El valor por defecto: −2 goles.
 *
 * Es un handicap **real**, no un «sin dato» disfrazado. Quien nunca fue calificado y quien fue
 * calificado en −2 valen lo mismo; lo que los distingue es que el primero no tiene historial
 * (R-030-05). Ningún consumidor debe deducir «no calificado» comparando contra esta constante.
 */
export const HANDICAP_POR_DEFECTO = HANDICAP_MINIMO_HALVES as HandicapHalves;

/**
 * Valida medios goles y devuelve el tipo marcado.
 *
 * Es la **única** puerta de entrada al tipo. Todo lo que llega de fuera del dominio —un `PUT`, una
 * fila de la base, un valor de un formulario— pasa por aquí.
 */
export function validarHandicap(halves: number): Result<HandicapHalves, HandicapInvalido> {
  if (!Number.isInteger(halves)) {
    // Cubre también `NaN` e `Infinity`, que no son enteros. Un `1.5` que llegue aquí es casi
    // siempre alguien que pasó goles donde iban medios goles.
    return err("no_es_medio_gol");
  }

  if (halves < HANDICAP_MINIMO_HALVES || halves > HANDICAP_MAXIMO_HALVES) {
    return err("fuera_de_rango");
  }

  return ok(halves as HandicapHalves);
}

/**
 * De goles a medios goles: `1.5` → `3`.
 *
 * Los handicaps válidos son múltiplos de 0.5, y todos se representan exactamente en binario, así
 * que `goles * 2` es exacto y no hace falta redondear. **No se redondea a propósito**: redondear
 * convertiría `1.3` en un handicap de 2.5 en silencio, que es justo el error que este módulo teme.
 * Un valor que no sea múltiplo de medio gol se rechaza.
 */
export function goalsToHalves(goals: number): Result<HandicapHalves, HandicapInvalido> {
  return validarHandicap(goals * 2);
}

/** De medios goles a goles: `3` → `1.5`. Siempre exacto, para mostrar y para calcular ventajas. */
export function halvesToGoals(halves: HandicapHalves): number {
  return halves / 2;
}
