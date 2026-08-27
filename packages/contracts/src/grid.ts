import { z } from "zod";
import { TeamLabelSchema } from "./team.js";

/** Un lugar de la grilla, ocupado o no (`specs/052`). */
export const GridCellResponse = z.object({
  chukker: z.number().int().positive(),
  equipo: TeamLabelSchema,
  position: z.number().int().positive(),
  /** Nulo es un **hueco**: ese puesto no lo jugó nadie ese chukker. */
  persona: z.object({ personId: z.string(), fullName: z.string() }).nullable(),
});

export type GridCellResponse = z.infer<typeof GridCellResponse>;

export const PracticeGridResponse = z.object({
  chukkers: z.number().int().positive(),
  /** Cerrada = congelada. Para cambiarla hay que reabrirla, que es un acto aparte y auditado. */
  cerrada: z.boolean(),
  celdas: z.array(GridCellResponse),
  /**
   * La cuenta por persona, **contada de las celdas** (R-052-02).
   *
   * Viaja calculada a propósito: la pantalla la muestra, no la recalcula. Es el mismo número que
   * va a usar el cobro de Fase 3, y dos implementaciones darían distinto el día que haya un caso
   * raro.
   */
  chukkersPorPersona: z.array(
    z.object({
      personId: z.string(),
      fullName: z.string(),
      chukkers: z.number().int().nonnegative(),
      /** Aceptado y no se presentó (R-052-03). Incompatible con tener celdas. */
      noSePresento: z.boolean(),
    }),
  ),
  resultado: z
    .object({
      golesA: z.number().int().nonnegative(),
      golesB: z.number().int().nonnegative(),
      notas: z.string().nullable(),
    })
    .nullable(),
});

export type PracticeGridResponse = z.infer<typeof PracticeGridResponse>;

/**
 * Ajustar la grilla manda **los cambios**, no la grilla entera.
 *
 * Es al revés que en equipos (`specs/051`), y a propósito. Un equipo es una **composición**: mover
 * a alguien de A a B cambia dos cosas a la vez, y media composición no significa nada. Una grilla
 * es una matriz de celdas **independientes**: que uno corrija el chukker 3 y otro el 5 no es un
 * conflicto que resolver, son dos correcciones que las dos son ciertas. Mandar la grilla entera las
 * convertiría en un conflicto artificial, y el segundo borraría trabajo ajeno sin decirlo.
 *
 * El lote sí se aplica **entero o nada**, pero por R-052-04, no por concurrencia.
 */
export const AdjustGridRequest = z.object({
  cambios: z
    .array(
      z.object({
        chukker: z.number().int().positive(),
        equipo: TeamLabelSchema,
        position: z.number().int().positive(),
        /** Nulo vacía la celda. */
        personId: z.string().min(1).nullable(),
      }),
    )
    .min(1)
    .max(64),
});

export type AdjustGridRequest = z.infer<typeof AdjustGridRequest>;

/** Marcar a quien no se presentó (R-052-03). */
export const NoShowRequest = z.object({ personId: z.string().min(1) });
export type NoShowRequest = z.infer<typeof NoShowRequest>;

/** El marcador. **Opcional**: una práctica se cierra sin él (R-052-09). */
export const PracticeResultRequest = z.object({
  golesA: z.number().int().nonnegative().max(99),
  golesB: z.number().int().nonnegative().max(99),
  notas: z.string().trim().max(500).nullable().optional(),
});

export type PracticeResultRequest = z.infer<typeof PracticeResultRequest>;
