import { z } from "zod";

const FechaDeCalendario = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Se espera YYYY-MM-DD");

export const CreateGuardianshipRequest = z.object({
  guardianPersonId: z.string().min(1),
  dependentPersonId: z.string().min(1),
  /** Quién recibe los cobros del menor en su estado de cuenta (R-010-10). */
  isPrimaryPayer: z.boolean().default(false),
  startsOn: FechaDeCalendario,
});

export type CreateGuardianshipRequest = z.infer<typeof CreateGuardianshipRequest>;

export const GuardianshipResponse = z.object({
  id: z.string(),
  guardianPersonId: z.string(),
  dependentPersonId: z.string(),
  isPrimaryPayer: z.boolean(),
  startsOn: FechaDeCalendario,
  endsOn: FechaDeCalendario.nullable(),
});

export type GuardianshipResponse = z.infer<typeof GuardianshipResponse>;

export const PublishWaiverRequest = z.object({
  body: z.string().min(1),
});

export type PublishWaiverRequest = z.infer<typeof PublishWaiverRequest>;

export const WaiverResponse = z.object({
  id: z.string(),
  version: z.number().int(),
  body: z.string(),
  publishedAt: z.string().datetime(),
});

export type WaiverResponse = z.infer<typeof WaiverResponse>;

export const AcceptWaiverRequest = z.object({
  /** En nombre de quién se acepta. Sin esto, se acepta para uno mismo. */
  personId: z.string().optional(),
});

export type AcceptWaiverRequest = z.infer<typeof AcceptWaiverRequest>;
