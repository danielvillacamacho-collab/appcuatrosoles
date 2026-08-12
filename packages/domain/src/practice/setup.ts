import { err, ok, type Result } from "../shared/result.js";

/** Los números y horas con que se crea una práctica. */
export interface ParametrosDePractica {
  startsAt: Date;
  endsAt: Date;
  targetPlayers: number;
  minPlayers: number;
  applicationsCloseAt: Date;
  decisionAt: Date;
}

export type RechazoDeParametros =
  /** La práctica terminaría antes de empezar. */
  | "rango_invalido"
  /** Un mínimo mayor que el objetivo hace una práctica que nunca se puede confirmar. */
  | "minimo_mayor_que_objetivo"
  /** No se puede decidir antes de dejar de recibir postulados (R-050-02). */
  | "cierre_despues_de_decision"
  /** Decidir si una práctica se hace, después de que empezó, no significa nada. */
  | "decision_despues_de_empezar";

/**
 * Los parámetros con que se crea una práctica son coherentes entre sí (`specs/050` HU-050-01).
 *
 * Las cuatro son reglas de negocio y no validación de formato: un contrato puede comprobar que
 * `minPlayers` es un entero positivo, pero que **no supere** a `targetPlayers` depende del otro
 * campo y de lo que significan.
 *
 * `decision_despues_de_empezar` **no está en el spec** y se agregó al implementar: decidir si una
 * práctica se hace cuando ya empezó no describe ninguna situación real, y sin la regla el club
 * puede crear una práctica que nunca se decide a tiempo sin que nada avise.
 */
export function validarParametrosDePractica(
  parametros: ParametrosDePractica,
): Result<void, RechazoDeParametros> {
  if (parametros.endsAt.getTime() <= parametros.startsAt.getTime()) {
    return err("rango_invalido");
  }

  if (parametros.minPlayers > parametros.targetPlayers) {
    return err("minimo_mayor_que_objetivo");
  }

  if (parametros.applicationsCloseAt.getTime() > parametros.decisionAt.getTime()) {
    return err("cierre_despues_de_decision");
  }

  if (parametros.decisionAt.getTime() > parametros.startsAt.getTime()) {
    return err("decision_despues_de_empezar");
  }

  return ok(undefined);
}
