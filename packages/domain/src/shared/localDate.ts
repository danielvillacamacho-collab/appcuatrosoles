/**
 * Una fecha de calendario sin hora ni zona: `"2026-08-10"`. Es el tipo que corresponde a las
 * columnas `@db.Date` del esquema (`guardianship.starts_on`, `ends_on`, …), que no guardan hora.
 *
 * **Por qué existe en vez de usar `Date`.** Un `Date` es un instante, y comparar un instante
 * contra una fecha de calendario es una de las formas más silenciosas de equivocarse: Prisma
 * devuelve una columna `date` como medianoche **UTC**, así que preguntar «¿sigue vigente hoy?»
 * con el `now` del sistema da por vencido un vínculo que termina el 10 de agosto desde las 7:00
 * p.m. del 9 en Bogotá — se pierde el último día entero sin que nada falle ni se note. Con este
 * tipo, pasar un `Date` donde va una fecha de calendario no compila.
 *
 * Se compara con `<`, `<=` y `===` directamente: en formato `YYYY-MM-DD` con ceros a la
 * izquierda, el orden alfabético y el cronológico son el mismo. Construirla siempre con
 * `toLocalDate`, que es quien garantiza ese formato.
 */
export type LocalDate = string;

/**
 * La fecha de calendario que es «hoy» en una zona horaria dada.
 *
 * La zona entra como parámetro y no está fija en `America/Bogota` a propósito: el producto se
 * vende a otros clubes (`docs/09` D-01) y el club es quien define la suya. Un club en Buenos
 * Aires no puede depender de que alguien se acuerde de cambiar una constante.
 *
 * @param instant momento a traducir — normalmente `clock.now()` (P-08).
 * @param timeZone identificador IANA del club, p. ej. `"America/Bogota"`.
 */
export function toLocalDate(instant: Date, timeZone: string): LocalDate {
  const formato = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Se arma pieza por pieza en vez de confiar en el texto que produce un locale: el orden y los
  // separadores de un formato localizado cambian con la versión de ICU, y aquí el formato exacto
  // no es cosmético — de él depende que comparar fechas como texto siga siendo correcto.
  const partes = Object.fromEntries(
    formato.formatToParts(instant).map((parte) => [parte.type, parte.value]),
  );

  return `${partes.year}-${partes.month}-${partes.day}`;
}
