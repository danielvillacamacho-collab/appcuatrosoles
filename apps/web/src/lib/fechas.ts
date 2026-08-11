import { useClub } from "../features/club/api/useClub.js";

/**
 * Instantes del API, mostrados en la zona horaria **del club** (regla de oro 9).
 *
 * El API persiste y responde en UTC. Pintarlo crudo hace que una sesión abierta a las 7 p.m. en
 * Bogotá figure como del día siguiente — el error clásico, y el que más confunde porque el dato
 * *casi* está bien.
 *
 * La zona sale de `GET /clubs/current/public`, no de una constante: el producto se vende a otros
 * clubes (`docs/09` D-01) y uno en Buenos Aires no puede depender de que alguien se acuerde de
 * cambiar un literal. `America/Bogota` es sólo el respaldo mientras la consulta llega.
 */
export function useFecha(): (iso: string) => string {
  const club = useClub();
  const timeZone = club.data?.timezone ?? "America/Bogota";

  return (iso: string) =>
    new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone }).format(
      new Date(iso),
    );
}

/** Una fecha de calendario (`YYYY-MM-DD`), que **no** es un instante y no lleva zona. */
export function fechaDeCalendario(fecha: string): string {
  const [ano, mes, dia] = fecha.split("-");

  // Se arma a mano y no con `new Date(fecha)`: eso último interpreta la cadena como medianoche UTC
  // y en Bogotá la muestra un día antes. Es el mismo error que `LocalDate` evita en el dominio.
  return `${dia}/${mes}/${ano}`;
}
