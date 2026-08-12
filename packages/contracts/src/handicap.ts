import { z } from "zod";

export const HandicapTypeSchema = z.enum(["international", "club"]);
export type HandicapTypeName = z.infer<typeof HandicapTypeSchema>;

/**
 * Un handicap vigente.
 *
 * **`calificado` va explícito y no se deduce del valor.** Quien nunca fue evaluado y quien fue
 * evaluado en −2 goles valen lo mismo —`−4` medios— porque −2 es un handicap real, no un centinela
 * (`specs/030` R-030-05). Sin este campo, cualquier consumidor que necesite la diferencia la
 * deduciría comparando contra −4, y se equivocaría con todos los principiantes de verdad.
 */
export const HandicapValue = z.object({
  /** Medios goles enteros: handicap 1.5 → 3 (constitution, regla 4). */
  valueHalves: z.number().int().min(-4).max(20),
  calificado: z.boolean(),
  /** Nulo mientras nadie lo haya fijado. */
  updatedAt: z.string().datetime().nullable(),
});

export type HandicapValue = z.infer<typeof HandicapValue>;

/** Los dos handicaps de una persona. Independientes: ninguno se deriva del otro (R-030-01). */
export const PersonHandicapsResponse = z.object({
  personId: z.string(),
  international: HandicapValue,
  club: HandicapValue,
});

export type PersonHandicapsResponse = z.infer<typeof PersonHandicapsResponse>;

/**
 * Fijar un handicap.
 *
 * El rango se repite aquí y en el dominio a propósito: el contrato rechaza barato lo absurdo antes
 * de tocar la base; el dominio es donde vive la regla. Lo que **no** se duplica es la decisión de
 * si el cambio es válido —que de verdad cambie algo, que traiga motivo—, que es sólo del dominio.
 */
export const SetHandicapRequest = z.object({
  valueHalves: z.number().int().min(-4).max(20),
  reason: z.string().trim().min(1).max(500),
});

export type SetHandicapRequest = z.infer<typeof SetHandicapRequest>;

/** Una entrada del historial. Sólo la ve quien puede (R-030-09). */
export const HandicapHistoryEntry = z.object({
  id: z.string(),
  type: HandicapTypeSchema,
  previousHalves: z.number().int(),
  newHalves: z.number().int(),
  reason: z.string(),
  changedAt: z.string().datetime(),
  changedBy: z.object({ personId: z.string(), fullName: z.string() }),
  /** La temporada en que ocurrió, si el club tenía alguna abierta (R-030-12). */
  season: z.object({ id: z.string(), name: z.string() }).nullable(),
});

export type HandicapHistoryEntry = z.infer<typeof HandicapHistoryEntry>;

export const HandicapHistoryResponse = z.object({
  personId: z.string(),
  /** Del más reciente al más antiguo: así se lee una evolución. */
  entries: z.array(HandicapHistoryEntry),
});

export type HandicapHistoryResponse = z.infer<typeof HandicapHistoryResponse>;

/** Una fila del listado del club: la persona con su handicap del tipo pedido. */
export const ClubHandicapRow = z.object({
  personId: z.string(),
  fullName: z.string(),
  handicap: HandicapValue,
});

/**
 * El listado del club, paginado.
 *
 * Existe porque el balanceo de equipos de `specs/050` necesita el handicap de todos los postulados
 * a la vez, y pedirlos uno por uno sería el problema de las N+1 consultas trasladado a la red.
 */
export const ClubHandicapListResponse = z.object({
  items: z.array(ClubHandicapRow),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export type ClubHandicapListResponse = z.infer<typeof ClubHandicapListResponse>;
