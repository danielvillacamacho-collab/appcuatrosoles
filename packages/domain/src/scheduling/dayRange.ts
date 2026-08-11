import type { LocalDate } from "../shared/localDate.js";
import type { RangoDeTiempo } from "./overlap.js";

/**
 * El día de calendario de un club, como rango de instantes (R-040-05).
 *
 * Es la inversa de `toLocalDate`, y hace falta por lo mismo: **«el martes» no es un instante hasta
 * que se sabe dónde queda el club**. El martes 1 de septiembre en Bogotá empieza a las 05:00 UTC y
 * termina a las 05:00 UTC del miércoles. Resolverlo con la zona del servidor —que en producción es
 * UTC— devolvería un día corrido cinco horas: la práctica de las 7:00 p.m. aparecería en el
 * calendario del día siguiente.
 *
 * El rango es semiabierto, como todo en este módulo: incluye la medianoche del día y excluye la
 * del siguiente.
 */
export function rangoDelDia(dia: LocalDate, timeZone: string): RangoDeTiempo {
  return { inicio: medianocheLocal(dia, timeZone), fin: medianocheLocal(diaSiguiente(dia), timeZone) };
}

/**
 * El instante en que empieza ese día en esa zona.
 *
 * **Se calcula en dos pasadas y no en una**, y no es exceso de cuidado: el desfase de una zona
 * depende del instante —por el horario de verano— así que para saber qué desfase aplicar hay que
 * saber ya de qué instante se habla. Se parte de una estimación, se mide el desfase ahí, se
 * corrige, y se vuelve a medir sobre el resultado. Colombia no cambia de hora y esto daría igual
 * con una sola pasada; el producto se vende a otros clubes (`docs/09` D-01) y en Santiago o Madrid
 * la primera pasada se equivoca una hora dos veces al año.
 */
function medianocheLocal(dia: LocalDate, timeZone: string): Date {
  const [ano, mes, fecha] = dia.split("-").map(Number);
  const comoSiFueraUtc = Date.UTC(ano ?? 0, (mes ?? 1) - 1, fecha ?? 1);

  const primera = comoSiFueraUtc - desfaseEnMinutos(new Date(comoSiFueraUtc), timeZone) * 60_000;
  const segunda = comoSiFueraUtc - desfaseEnMinutos(new Date(primera), timeZone) * 60_000;

  return new Date(segunda);
}

/** Cuántos minutos va esa zona por delante de UTC en ese instante. Bogotá: −300. */
function desfaseEnMinutos(instante: Date, timeZone: string): number {
  const formato = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const partes = Object.fromEntries(
    formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );

  const leidoComoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
  );

  return (leidoComoUtc - instante.getTime()) / 60_000;
}

/** El día siguiente, en el calendario. No toca horas: es aritmética de fechas. */
function diaSiguiente(dia: LocalDate): LocalDate {
  const [ano, mes, fecha] = dia.split("-").map(Number);
  const siguiente = new Date(Date.UTC(ano ?? 0, (mes ?? 1) - 1, (fecha ?? 1) + 1));

  return siguiente.toISOString().slice(0, 10);
}
