import { err, ok, type Result } from "../shared/result.js";
import type { HandicapHalves } from "../handicap/halves.js";

export type RechazoDePostulacion =
  /** El estudiante no está habilitado hasta el nivel de esta práctica (R-050-05). */
  | "supera_su_habilitacion"
  /**
   * El estudiante está habilitado hasta cierto nivel y **la práctica no declara el suyo**, así que
   * no hay contra qué comparar.
   */
  | "practica_sin_nivel_declarado";

/** Quién quiere postularse. `topeDeEstudiante` es nulo para quien no es estudiante habilitado. */
export interface QuienSePostula {
  topeDeEstudiante: HandicapHalves | null;
}

/** La práctica, en lo único que decide quién puede entrar. */
export interface PracticaParaPostular {
  /**
   * El nivel de la práctica, cuando el club lo declara. **No es el rango sugerido**: el rango
   * orienta y esto prohíbe, y van en campos distintos justamente para que no se confundan.
   */
  nivelMaximoHalves: HandicapHalves | null;
}

/**
 * ¿Puede esta persona postularse a esta práctica? (`specs/050` R-050-04, R-050-05)
 *
 * **El rango sugerido no entra en esta función, y es a propósito.** Decidido el 2026-08-11: el
 * rango orienta y se muestra —«para jugadores de 2 a 6 goles»— pero no rechaza a nadie. Un jugador
 * de 8 puede ofrecerse para completar una práctica de 2 a 6, y el comisario decide.
 *
 * Lo único que prohíbe es la habilitación del estudiante, y **prohíbe de verdad**: no es una
 * preferencia sino seguridad. Un estudiante que se mete en una práctica por encima de su nivel se
 * puede lastimar.
 *
 * **Falla cerrado**: si la persona tiene tope y la práctica no declara nivel, se rechaza. Es
 * incómodo —obliga al club a declarar el nivel de las prácticas donde quiera estudiantes— y es lo
 * correcto: la alternativa es dejar entrar a un estudiante a algo que nadie verificó.
 */
export function puedePostularse(
  quien: QuienSePostula,
  practica: PracticaParaPostular,
): Result<void, RechazoDePostulacion> {
  if (quien.topeDeEstudiante === null) {
    // Sin habilitación de estudiante no hay tope que respetar: el rango sugerido no prohíbe.
    return ok(undefined);
  }

  if (practica.nivelMaximoHalves === null) {
    return err("practica_sin_nivel_declarado");
  }

  return practica.nivelMaximoHalves <= quien.topeDeEstudiante
    ? ok(undefined)
    : err("supera_su_habilitacion");
}
