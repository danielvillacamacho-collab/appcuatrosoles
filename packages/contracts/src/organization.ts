import { z } from "zod";

/** `school` | `team` | `service` es lo que hay hoy (`docs/02` §A), pero el campo es texto: el club
 * puede necesitar un tipo que todavía no existe y no debería esperar un despliegue (P-04). */
export const CreateOrganizationRequest = z.object({
  name: z.string().min(1).max(120),
  type: z.string().min(1).max(40),
});

export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequest>;

export const UpdateOrganizationRequest = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.string().min(1).max(40).optional(),
});

export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequest>;

export const OrganizationResponse = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.enum(["active", "archived"]),
  archivedAt: z.string().datetime().nullable(),
});

export type OrganizationResponse = z.infer<typeof OrganizationResponse>;
