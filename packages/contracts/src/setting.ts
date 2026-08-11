import { z } from "zod";

export const SetSettingRequest = z.object({
  /** El tipo real lo impone el catálogo de `packages/domain`, no este contrato (R-020-09). */
  value: z.unknown(),
  /** Desde cuándo rige. Por defecto, ahora. Permite programar un cambio para el mes que viene. */
  effectiveFrom: z.string().datetime().optional(),
});

export type SetSettingRequest = z.infer<typeof SetSettingRequest>;

export const SettingResponse = z.object({
  key: z.string(),
  value: z.unknown(),
  /**
   * De dónde salió: fijado en este mismo ámbito, heredado de uno más amplio, o el default del
   * catálogo. Distinguirlo es la mitad de HU-020-08 — «el club decidió 18» no es lo mismo que
   * «nadie decidió nada y 18 es lo que trae el sistema».
   */
  source: z.enum(["explicit", "inherited", "default"]),
  scope: z.enum(["platform", "club", "organization"]).nullable(),
  effectiveFrom: z.string().datetime().nullable(),
});

export type SettingResponse = z.infer<typeof SettingResponse>;

export const SettingHistoryEntry = z.object({
  value: z.unknown(),
  effectiveFrom: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type SettingHistoryEntry = z.infer<typeof SettingHistoryEntry>;
