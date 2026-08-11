import type { HandicapHalves } from "./halves.js";

/**
 * El handicap de un equipo, en medios goles.
 *
 * **No es un `HandicapHalves` y no puede serlo**: ese tipo acota −4 a 20 porque ése es el rango de
 * **un jugador**. Cuatro jugadores de 20 medios suman 80, y 80 es un total perfectamente normal —
 * un equipo de 40 goles. Devolver el tipo acotado obligaría a validar la suma contra un rango que
 * no le corresponde, y el primer equipo fuerte haría fallar el cálculo.
 */
export type HandicapDeEquipo = number;

/**
 * La suma de los handicaps de un equipo (`docs/source` §5: «el handicap de un equipo es la suma de
 * los handicaps de sus jugadores»).
 *
 * Vive aquí y no en `specs/050` porque es aritmética de handicap. Lo que **no** entra es la regla
 * del «medio hombre» —cuando dos jugadores comparten puesto, ese puesto pesa el más alto de los
 * dos, no la suma—: eso es composición de equipos, y decide qué valores llegan a esta función, no
 * cómo se suman.
 */
export function handicapDelEquipo(jugadores: readonly HandicapHalves[]): HandicapDeEquipo {
  return jugadores.reduce((total, jugador) => total + jugador, 0);
}
