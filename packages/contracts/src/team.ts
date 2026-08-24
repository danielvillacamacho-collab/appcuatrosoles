import { z } from "zod";

export const TeamLabelSchema = z.enum(["A", "B"]);
export type TeamLabelName = z.infer<typeof TeamLabelSchema>;

const persona = z.object({ personId: z.string(), fullName: z.string() });

export const PracticeSlotResponse = z.object({
  id: z.string(),
  position: z.number().int(),
  /** El handicap **con que se armó el equipo**, congelado (`specs/051` §0 del plan). */
  effectiveHandicapHalves: z.number().int(),
  titular: persona,
  /**
   * El medio hombre. **Se muestran los dos nombres** (HU-051-03): quien mira tiene que entender
   * por qué ese puesto pesa lo que pesa, y con un solo nombre el número no se explica.
   */
  companero: persona.nullable(),
});

export type PracticeSlotResponse = z.infer<typeof PracticeSlotResponse>;

export const PracticeTeamsResponse = z.object({
  /** Mientras sea falso, sólo lo ve quien puede aprobarlo (R-051-05). */
  aprobados: z.boolean(),
  aprobadosAt: z.string().datetime().nullable(),
  /** Lo que mira el comisario. Es la función entera del asistente de balance. */
  diferenciaHalves: z.number().int(),
  equipos: z.array(
    z.object({
      label: TeamLabelSchema,
      handicapTotalHalves: z.number().int(),
      slots: z.array(PracticeSlotResponse),
    }),
  ),
});

export type PracticeTeamsResponse = z.infer<typeof PracticeTeamsResponse>;

/**
 * Ajustar manda **la composición entera**, no una lista de movimientos.
 *
 * Dos pestañas abiertas mandando movimientos incrementales sobre estados distintos producen un
 * equipo que ninguna de las dos vio. Con la composición completa, la última gana y lo que queda es
 * exactamente lo que alguien miró antes de guardar.
 */
export const AdjustTeamsRequest = z.object({
  equipos: z
    .array(
      z.object({
        label: TeamLabelSchema,
        /** Los identificadores de puesto, en el orden en que van a quedar. */
        slotIds: z.array(z.string().min(1)),
      }),
    )
    .length(2),
});

export type AdjustTeamsRequest = z.infer<typeof AdjustTeamsRequest>;
