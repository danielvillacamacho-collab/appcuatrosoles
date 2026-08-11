import { z } from "zod";

/** Los estados de una cancha. `archived` es el borrado que no borra (P-06, R-040-08). */
export const FieldStatus = z.enum(["active", "maintenance", "archived"]);

export const FieldResponse = z.object({
  id: z.string(),
  name: z.string(),
  surface: z.string().nullable(),
  capacityNotes: z.string().nullable(),
  status: FieldStatus,
});

export type FieldResponse = z.infer<typeof FieldResponse>;

export const CreateFieldRequest = z.object({
  name: z.string().trim().min(1).max(60),
  surface: z.string().trim().max(120).optional(),
  capacityNotes: z.string().trim().max(300).optional(),
});

export type CreateFieldRequest = z.infer<typeof CreateFieldRequest>;

/**
 * Editar una cancha.
 *
 * `status` admite `active` y `maintenance`, **no `archived`**: archivar es una acción con su propia
 * ruta y su propio registro de auditoría. Colarla como un cambio de campo la haría parecer
 * reversible y trivial, y es lo contrario — es lo que se hace en vez de borrar.
 */
export const UpdateFieldRequest = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  surface: z.string().trim().max(120).nullable().optional(),
  capacityNotes: z.string().trim().max(300).nullable().optional(),
  status: z.enum(["active", "maintenance"]).optional(),
});

export type UpdateFieldRequest = z.infer<typeof UpdateFieldRequest>;

/**
 * Bloquear una franja por mantenimiento o riego (HU-040-03).
 *
 * El motivo es **obligatorio**: un bloqueo sin motivo es una franja que nadie sabe por qué está
 * ocupada, y la siguiente persona que quiera programar ahí no tiene a quién preguntarle.
 */
export const BlockFieldRequest = z.object({
  fieldId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().trim().min(1).max(200),
});

export type BlockFieldRequest = z.infer<typeof BlockFieldRequest>;

export const FieldBookingResponse = z.object({
  id: z.string(),
  fieldId: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  type: z.string(),
  reason: z.string().nullable(),
});

export type FieldBookingResponse = z.infer<typeof FieldBookingResponse>;
