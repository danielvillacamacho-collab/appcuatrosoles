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

/**
 * Crear el perfil de un menor **sin cuenta propia** (T-076, HU-010-10).
 *
 * No lleva correo de acceso ni contraseña: ése es justamente el punto — el menor existe en el club,
 * juega, se le cobra y se le firma el waiver, y quien entra a la plataforma es su acudiente.
 *
 * El acudiente **es obligatorio y va en la misma petición**. Un menor sin acudiente es exactamente
 * el estado roto que persigue el job de integridad de T-071: existe, se le puede cobrar, y no hay
 * a quién cobrarle. Crearlo en dos pasos deja la puerta abierta a que el segundo no ocurra.
 */
export const CreateMinorRequest = z.object({
  fullName: z.string().min(1).max(120),
  birthdate: FechaDeCalendario,
  guardianPersonId: z.string().min(1),
  /** Por defecto sí: el primer acudiente de un menor recién creado es quien paga (R-010-10). */
  isPrimaryPayer: z.boolean().default(true),
  /** De contacto, para el club. No es un correo de acceso: el menor no tiene cuenta. */
  email: z.string().trim().email().optional(),
  phone: z.string().max(40).optional(),
  membershipCategoryId: z.string().optional(),
});

export type CreateMinorRequest = z.infer<typeof CreateMinorRequest>;

/**
 * Un perfil a cargo, visto por su acudiente (`spec.md` §10, pantalla «Perfiles a cargo»).
 *
 * Trae `isPrimaryPayer` porque es la respuesta a la pregunta que trae a alguien a esta pantalla:
 * «¿a mí me van a cobrar lo de este niño?» (R-010-10).
 */
export const DependentResponse = z.object({
  personId: z.string(),
  fullName: z.string(),
  birthdate: FechaDeCalendario.nullable(),
  isMinor: z.boolean(),
  status: z.string(),
  isPrimaryPayer: z.boolean(),
  membershipCategory: z.object({ code: z.string(), name: z.string() }).nullable(),
  /** Si el acudiente ya firmó la exención vigente por este menor (R-010-12). */
  waiverAccepted: z.boolean(),
});

export type DependentResponse = z.infer<typeof DependentResponse>;
