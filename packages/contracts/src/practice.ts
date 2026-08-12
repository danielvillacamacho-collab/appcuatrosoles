import { z } from "zod";
import { HandicapTypeSchema } from "./handicap.js";

export const PracticeStatusSchema = z.enum(["draft", "published", "confirmed", "cancelled"]);
export type PracticeStatusName = z.infer<typeof PracticeStatusSchema>;

const handicapHalves = z.number().int().min(-4).max(20);

/**
 * Crear una práctica.
 *
 * `chukkers` **no se limita a 6, 7 u 8** aquí: eso es configuración del club
 * (`practice.default_chukkers_options`), y un contrato que lo fije obliga a desplegar para que un
 * club juegue a 5. El contrato acota lo absurdo; la política la pone `settings` (P-04).
 */
export const CreatePracticeRequest = z.object({
  fieldId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  chukkers: z.number().int().min(1).max(12),
  handicapType: HandicapTypeSchema,
  /** Orienta; no rechaza a nadie (R-050-04). */
  suggestedMinHalves: handicapHalves.optional(),
  suggestedMaxHalves: handicapHalves.optional(),
  /** Esto sí filtra, y sólo a estudiantes (R-050-05). */
  maxLevelHalves: handicapHalves.optional(),
  targetPlayers: z.number().int().min(1).max(40),
  minPlayers: z.number().int().min(1).max(40),
  applicationsCloseAt: z.string().datetime(),
  decisionAt: z.string().datetime(),
});

export type CreatePracticeRequest = z.infer<typeof CreatePracticeRequest>;

export const UpdatePracticeRequest = CreatePracticeRequest.partial();
export type UpdatePracticeRequest = z.infer<typeof UpdatePracticeRequest>;

export const CancelPracticeRequest = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type CancelPracticeRequest = z.infer<typeof CancelPracticeRequest>;

export const ApplyToPracticeRequest = z.object({
  chukkersOffered: z.number().int().min(1).max(12),
  /** A quién propone como compañero de puesto. La pareja sólo existe si es recíproca (R-050-08). */
  halfManPartnerPersonId: z.string().min(1).optional(),
  /** Un acudiente postulando a un menor a su cargo. */
  onBehalfOfPersonId: z.string().min(1).optional(),
});

export type ApplyToPracticeRequest = z.infer<typeof ApplyToPracticeRequest>;

/** Un postulado, como lo ve quien mira la práctica (R-050-13). */
export const PracticeApplicant = z.object({
  personId: z.string(),
  fullName: z.string(),
  chukkersOffered: z.number().int(),
  estado: z.enum(["dentro", "en_espera"]),
  /** La posición del **puesto**: los dos de una pareja comparten la misma. */
  posicion: z.number().int(),
  /** El compañero de puesto, cuando la pareja está formada. */
  companero: z.object({ personId: z.string(), fullName: z.string() }).nullable(),
});

export const PracticeResponse = z.object({
  id: z.string(),
  fieldId: z.string(),
  fieldName: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  chukkers: z.number().int(),
  handicapType: HandicapTypeSchema,
  suggestedMinHalves: z.number().int().nullable(),
  suggestedMaxHalves: z.number().int().nullable(),
  maxLevelHalves: z.number().int().nullable(),
  targetPlayers: z.number().int(),
  minPlayers: z.number().int(),
  applicationsCloseAt: z.string().datetime(),
  decisionAt: z.string().datetime(),
  status: PracticeStatusSchema,
  cancellationReason: z.string().nullable(),

  puestosDentro: z.number().int(),
  puestosEnEspera: z.number().int(),
  /** Abierta a postulaciones ahora mismo, según el reloj del servidor. */
  abierta: z.boolean(),

  /**
   * **Dónde estoy yo.** Es la mitad de la razón por la que alguien abre esta pantalla: un tablero
   * que sólo dice «postulado» deja a la gente sin saber si preparar los caballos.
   */
  miPostulacion: z
    .object({
      estado: z.enum(["dentro", "en_espera"]),
      posicion: z.number().int(),
      chukkersOffered: z.number().int(),
      medioHombre: z
        .object({ personId: z.string(), fullName: z.string(), aceptada: z.boolean() })
        .nullable(),
      /**
       * Quién **me** propuso compartir puesto y todavía no le respondí.
       *
       * Va explícito porque no se puede deducir de `postulados`: ahí el compañero sólo aparece
       * cuando la pareja **ya está formada**, así que una propuesta pendiente era invisible y el
       * endpoint de aceptarla no se podía alcanzar desde ninguna pantalla.
       */
      propuestaRecibida: z.object({ personId: z.string(), fullName: z.string() }).nullable(),
    })
    .nullable(),

  /** Quiénes van. Saberlo es la otra mitad de la decisión de ir (R-050-13). */
  postulados: z.array(PracticeApplicant),
});

export type PracticeResponse = z.infer<typeof PracticeResponse>;

export const PracticeListResponse = z.object({
  items: z.array(PracticeResponse),
});

export type PracticeListResponse = z.infer<typeof PracticeListResponse>;
