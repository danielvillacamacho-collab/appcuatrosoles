import { z } from "zod";

/** Fechas de calendario (`YYYY-MM-DD`), no instantes: una temporada empieza un día, no a una hora. */
const FechaDeCalendario = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Se espera YYYY-MM-DD");

export const CreateSeasonRequest = z.object({
  name: z.string().min(1).max(80),
  startsOn: FechaDeCalendario,
  /** Último día de la temporada, **inclusive**. */
  endsOn: FechaDeCalendario,
});

export type CreateSeasonRequest = z.infer<typeof CreateSeasonRequest>;

export const SeasonResponse = z.object({
  id: z.string(),
  name: z.string(),
  startsOn: FechaDeCalendario,
  endsOn: FechaDeCalendario,
  status: z.enum(["open", "closed"]),
});

export type SeasonResponse = z.infer<typeof SeasonResponse>;
