import { err, ok, type Result } from "../shared/result.js";
import { validarHandicap, type HandicapHalves } from "./halves.js";

/** Un cambio que ya pasó todas las reglas y se puede escribir tal cual. */
export interface CambioDeHandicap {
  anterior: HandicapHalves;
  nuevo: HandicapHalves;
  /** Ya sin espacios sobrantes: es el texto que se guarda. */
  motivo: string;
}

/**
 * Por qué no se puede hacer el cambio.
 *
 * Unión discriminada y no una cadena suelta: `sin_cambio` lleva el valor que ya rige, para que la
 * interfaz pueda decir «ya está en 2.5» en vez de «no hubo cambios».
 */
export type RechazoDeCambio =
  | { razon: "fuera_de_rango" }
  | { razon: "no_es_medio_gol" }
  | { razon: "sin_cambio"; actual: HandicapHalves }
  | { razon: "sin_motivo" };

/**
 * La regla completa de un cambio de handicap (`specs/030` HU-030-01).
 *
 * **No sabe quién lo pide.** Que el actor sea el comisario lo decide `hasPermission`, y son dos
 * preguntas distintas: «¿tiene autoridad?» y «¿es un cambio válido?». Mezclarlas obligaría a este
 * archivo a conocer los roles, y a la tabla de permisos a conocer el rango del polo.
 *
 * **El orden de las comprobaciones es deliberado.** Un valor inválido se rechaza primero porque
 * ni siquiera es un handicap. `sin_cambio` va antes que `sin_motivo` porque cuando el valor es el
 * que ya rige, la operación no tiene sentido **aunque** se escriba un motivo: pedir primero el
 * motivo mandaría al comisario a redactar algo para después rechazarlo igual.
 */
export function planearCambioDeHandicap(
  actual: HandicapHalves,
  propuesto: number,
  motivo: string,
): Result<CambioDeHandicap, RechazoDeCambio> {
  const validado = validarHandicap(propuesto);

  if (!validado.ok) {
    return err({ razon: validado.error });
  }

  if (validado.value === actual) {
    // R-030-08. Sin esto el historial se llena de filas idénticas y deja de servir para lo único
    // que existe: mostrar cómo evolucionó un jugador.
    return err({ razon: "sin_cambio", actual });
  }

  const motivoLimpio = motivo.trim();

  if (motivoLimpio === "") {
    // R-030-07. Un motivo de sólo espacios es un motivo ausente escrito de otra forma.
    return err({ razon: "sin_motivo" });
  }

  return ok({ anterior: actual, nuevo: validado.value, motivo: motivoLimpio });
}
