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

/**
 * Una preferencia de aviso (T-091).
 *
 * Se devuelve **la lista completa de tipos**, no sólo las filas guardadas: sin fila se recibe el
 * aviso, y una pantalla que sólo viera las filas mostraría una lista vacía la primera vez.
 */
export const NotificationPreferenceResponse = z.object({
  type: z.string(),
  enabled: z.boolean(),
  /**
   * Los avisos de seguridad y los que *son* el mecanismo —invitación, restablecimiento— no se
   * pueden apagar. La interfaz los muestra en gris, no los esconde: esconderlos haría creer que
   * el sistema no los manda.
   */
  canDisable: z.boolean(),
});

export type NotificationPreferenceResponse = z.infer<typeof NotificationPreferenceResponse>;

/**
 * El formato de un tipo de aviso: `modulo.accion-en-kebab`. No se valida contra una lista cerrada
 * —ver la nota de `MeService.actualizarPreferencias`— así que la forma es lo único que impide que
 * la tabla se llene de basura.
 */
const TIPO_DE_AVISO = /^[a-z][a-z0-9]*\.[a-z0-9-]+$/u;

export const UpdateNotificationPreferencesRequest = z.object({
  preferences: z
    .array(z.object({ type: z.string().max(80).regex(TIPO_DE_AVISO), enabled: z.boolean() }))
    .min(1)
    .max(100),
});

export type UpdateNotificationPreferencesRequest = z.infer<
  typeof UpdateNotificationPreferencesRequest
>;
