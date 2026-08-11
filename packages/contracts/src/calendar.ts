import { z } from "zod";

/**
 * Una franja del calendario, en **una de dos formas** (R-040-07).
 *
 * Es una unión discriminada y no un objeto con campos opcionales, y la diferencia es la que
 * sostiene la privacidad: con un solo tipo, «Ocupado» serían los mismos campos en `null`, y el día
 * que alguien agregue un dato a la respuesta se lo va a agregar a los dos casos sin pensarlo. Con
 * dos formas distintas, agregar algo al caso detallado **no lo agrega** al anónimo, y el compilador
 * lo dice.
 */
export const CalendarEntry = z.discriminatedUnion("detalle", [
  z.object({
    detalle: z.literal(true),
    id: z.string(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    type: z.string(),
    reason: z.string().nullable(),
    sourceId: z.string().nullable(),
  }),
  z.object({
    /** Lo ajeno y privado: cuándo empieza, cuándo termina, y nada más. */
    detalle: z.literal(false),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  }),
]);

export type CalendarEntry = z.infer<typeof CalendarEntry>;

/**
 * El día, por cancha.
 *
 * Devuelve **todas las canchas**, también las que no tienen nada: un día vacío tiene que verse como
 * tres canchas libres, no como una lista vacía que igual podría significar «no hay canchas» o «no
 * cargó».
 */
export const CalendarResponse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  /** La zona del club: quien pinta las horas la necesita para no usar la del navegador. */
  timezone: z.string(),
  fields: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      entries: z.array(CalendarEntry),
    }),
  ),
});

export type CalendarResponse = z.infer<typeof CalendarResponse>;
