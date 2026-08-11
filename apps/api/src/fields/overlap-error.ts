import { HttpStatus } from "@nestjs/common";
import { ApiException } from "../common/errors/api-error.js";

/** El código de PostgreSQL para una violación de restricción de exclusión. */
const VIOLACION_DE_EXCLUSION = "23P01";

/** El nombre de nuestra restricción, el de la migración de T-401. */
const RESTRICCION = "no_field_overlap";

/**
 * ¿Este error es el choque de dos reservas? (T-421)
 *
 * **Se reconoce leyendo el mensaje, y no es por pereza.** Prisma no le da a este error una clase
 * propia: llega como `PrismaClientUnknownRequestError`, sin `code` y sin `meta` —se comprobó
 * imprimiendo el error real— y lo único que queda del fallo de PostgreSQL es el texto anidado, que
 * sí trae el código `23P01` y el nombre de la restricción.
 *
 * Se exigen **los dos**: el código solo aparecería también en el `EXCLUDE` de temporadas de
 * `specs/020`, y traducir aquél a «esa cancha ya está ocupada» sería mentir. El nombre solo podría
 * aparecer en cualquier mensaje que lo mencione.
 */
export function esChoqueDeReservas(error: unknown): boolean {
  const mensaje = error instanceof Error ? error.message : "";

  return mensaje.includes(VIOLACION_DE_EXCLUSION) && mensaje.includes(RESTRICCION);
}

/**
 * El choque, contado como lo entiende una persona (T-421).
 *
 * Sin esta traducción, quien intenta programar una práctica recibe un `500` con «conflicting key
 * value violates exclusion constraint "no_field_overlap"». Es cierto, es inútil, y además revela el
 * nombre de una restricción interna.
 *
 * **Dice con qué choca, no sólo que chocó.** «Esa cancha está ocupada» deja a alguien mirando un
 * calendario que quizá no muestra el evento —porque es privado de otro— sin entender por qué no
 * puede reservar. Con el horario de lo que ocupa, la respuesta es accionable: se mueve media hora
 * y listo.
 */
export function choqueDeReservas(
  ocupado: { startsAt: Date; endsAt: Date } | null,
  timeZone: string,
): ApiException {
  return new ApiException(
    "cancha_ocupada",
    HttpStatus.CONFLICT,
    ocupado === null
      ? "Esa cancha ya está ocupada en ese horario."
      : `Esa cancha ya está ocupada de ${hora(ocupado.startsAt, timeZone)} a ${hora(ocupado.endsAt, timeZone)}.`,
    // El horario también va en `details`, en crudo, para que la interfaz pueda resaltar la franja
    // en el calendario en vez de sólo mostrar el texto.
    ocupado === null
      ? undefined
      : { ocupadoDesde: ocupado.startsAt.toISOString(), ocupadoHasta: ocupado.endsAt.toISOString() },
  );
}

/**
 * La hora, en la zona **del club**.
 *
 * Entra como parámetro y no como constante: quien llama acaba de comprobar que la cancha pertenece
 * a este club, así que ya tiene la zona a mano. Un `"America/Bogota"` fijo aquí diría «ocupada de
 * 4:00 a 5:30» a un club de Buenos Aires sobre una franja que allá es de 6:00 a 7:30 — y sería
 * además el primer lugar del código atado a un club en particular (`CLAUDE.md`, contexto de
 * negocio).
 */
function hora(instante: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(instante);
}
