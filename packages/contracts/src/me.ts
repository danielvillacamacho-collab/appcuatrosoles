import { z } from "zod";

/**
 * El perfil propio (`GET /me`, HU-010-07).
 *
 * Trae lo que la persona necesita ver de sí misma: quién es, qué puede hacer y a qué pertenece.
 * **No trae campos administrativos** —notas internas, quién la creó, su estado de cuenta— porque
 * son datos *sobre* ella que no le corresponde editar ni, en algunos casos, ver.
 */
export const MeResponse = z.object({
  userAccountId: z.string(),
  personId: z.string(),
  fullName: z.string(),
  /** El correo de **acceso**. El de contacto de la persona puede ser otro y no se expone aquí. */
  email: z.string(),
  /** Correo nuevo pendiente de confirmación, si pidió cambiarlo (T-042). */
  pendingEmail: z.string().nullable(),
  phone: z.string().nullable(),
  photoKey: z.string().nullable(),
  roles: z.array(
    z.object({
      role: z.string(),
      scope: z.enum(["platform", "club", "organization"]),
      scopeId: z.string().nullable(),
    }),
  ),
  organizations: z.array(z.object({ id: z.string(), name: z.string(), relationship: z.string() })),
  membershipCategory: z.object({ code: z.string(), name: z.string() }).nullable(),
});

export type MeResponse = z.infer<typeof MeResponse>;

/**
 * Lo que una persona puede cambiar de su propio perfil (T-041).
 *
 * Tres campos, y la lista corta es la regla: el nombre, la categoría de membresía y los roles son
 * datos que administra el club, no su titular. Mandarlos **no da error**: el contrato los descarta
 * en silencio, porque un error revelaría que el campo existe a quien no debería tocarlo.
 */
export const UpdateMeRequest = z.object({
  phone: z.string().max(40).nullable().optional(),
  photoKey: z.string().max(300).nullable().optional(),
});

export type UpdateMeRequest = z.infer<typeof UpdateMeRequest>;

export const RequestEmailChangeRequest = z.object({
  newEmail: z.string().trim().email(),
  /** Se pide la contraseña: cambiar el correo de acceso es cambiar la llave de la cuenta. */
  currentPassword: z.string().min(1),
});

export type RequestEmailChangeRequest = z.infer<typeof RequestEmailChangeRequest>;

export const ConfirmEmailChangeRequest = z.object({ token: z.string().min(1) });

export type ConfirmEmailChangeRequest = z.infer<typeof ConfirmEmailChangeRequest>;

export const SessionResponse = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  userAgent: z.string().nullable(),
  rememberMe: z.boolean(),
  /** La sesión desde la que se está mirando: la interfaz no debería ofrecer «cerrar» sobre ella. */
  current: z.boolean(),
});

export type SessionResponse = z.infer<typeof SessionResponse>;
