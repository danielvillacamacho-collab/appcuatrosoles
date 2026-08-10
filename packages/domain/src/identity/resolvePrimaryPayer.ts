import type { LocalDate } from "../shared/localDate.js";
import { err, ok, type Result } from "../shared/result.js";

/**
 * Un vínculo de acudiente con un menor. La ventana `startsOn`/`endsOn` es de calendario, sin hora
 * (columnas `@db.Date`), y `endsOn` nulo significa «sigue vigente».
 */
export interface GuardianshipRef {
  /** El adulto: es él quien recibe los cobros del menor en su estado de cuenta (R-010-10). */
  guardianPersonId: string;
  isPrimaryPayer: boolean;
  startsOn: LocalDate;
  /** Último día en que el vínculo rige, **inclusive**. Nulo si no tiene fin previsto. */
  endsOn: LocalDate | null;
}

export type PrimaryPayerFailure =
  /** Nadie responde hoy por los cobros de este menor. Lo vigila el job diario T-071. */
  | "no_primary_payer"
  /** Dos acudientes **distintos** marcados a la vez: no se puede saber a quién cobrar. */
  | "multiple_primary_payers";

/**
 * ¿A quién se le consolidan hoy los cobros de este menor? (R-010-10, HU-010-10)
 *
 * **No elige cuando hay ambigüedad, y esa es la razón de ser de la función.** Si dos acudientes
 * distintos figuran como pagador principal el mismo día, el dato está roto —el invariante dice
 * «exactamente uno vigente»— y cualquier desempate que se invente aquí (el más antiguo, el
 * primero de la lista) le carga a alguien una factura que quizá no le toca, en silencio y sin que
 * nadie lo revise. Devolver error obliga a que un humano lo corrija.
 *
 * Un caso que **sí** se resuelve: varias filas solapadas que apuntan al **mismo** acudiente. Ahí
 * no hay elección arbitraria que hacer —la plata va al mismo estado de cuenta de todos modos— y
 * bloquear a la familia por un vínculo duplicado sería un castigo sin beneficio. Sigue siendo un
 * dato sucio y le corresponde detectarlo al job de integridad.
 *
 * @param guardianships los vínculos de **un solo** dependiente, ya filtrados por club (P-05).
 *   Mezclar dependientes aquí devolvería el pagador de otro niño sin que nada falle.
 * @param today fecha de calendario de hoy **en la zona horaria del club**, vía
 *   `toLocalDate(clock.now(), zonaDelClub)` (P-08).
 */
export function resolvePrimaryPayer(
  guardianships: readonly GuardianshipRef[],
  today: LocalDate,
): Result<string, PrimaryPayerFailure> {
  const pagadores = guardianships.filter(
    (vinculo) => vinculo.isPrimaryPayer && rigeHoy(vinculo, today),
  );

  const personas = [...new Set(pagadores.map((vinculo) => vinculo.guardianPersonId))];
  const [pagador] = personas;

  if (pagador === undefined) {
    return err("no_primary_payer");
  }

  if (personas.length > 1) {
    return err("multiple_primary_payers");
  }

  return ok(pagador);
}

/** La ventana incluye sus dos extremos: el primer día ya paga y el último todavía paga. */
function rigeHoy(vinculo: GuardianshipRef, today: LocalDate): boolean {
  if (today < vinculo.startsOn) {
    return false;
  }

  return vinculo.endsOn === null || today <= vinculo.endsOn;
}
