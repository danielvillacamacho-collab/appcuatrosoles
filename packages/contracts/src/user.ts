import { z } from "zod";

const RolAsignable = z.enum([
  "player",
  "instructor",
  "groom",
  "treasurer",
  "commissioner",
  "club_admin",
  "organization_admin",
]);

export const CreateUserRequest = z.object({
  /**
   * **Opcional a propósito** (HU-010-02, «variante ligera»): el administrador puede invitar con
   * sólo el correo y dejar que la persona ponga sus datos al aceptar. Sin nombre, la ficha queda
   * con la parte local del correo como provisional — no vacía, porque una lista de usuarios con
   * filas en blanco es peor que una con nombres feos.
   */
  fullName: z.string().min(1).max(120).optional(),
  /**
   * Darle cuenta a una **persona que ya existe** (HU-010-03, segundo criterio).
   *
   * El invitado externo de una copa entra al club como `person` sin cuenta; el menor que cumple
   * la edad del club también es una persona con años de historia. Cuando cualquiera de los dos
   * necesita entrar, se le crea la cuenta **sobre su persona** — nunca una nueva, o el club
   * termina con dos fichas del mismo jugador y sólo una tiene el historial.
   *
   * Con `personId`, `fullName` se ignora: el nombre de alguien que ya está en el club no se
   * cambia de paso al darle acceso.
   */
  personId: z.string().optional(),
  email: z.string().trim().email(),
  phone: z.string().max(40).optional(),
  membershipCategoryId: z.string().optional(),
  /** Por defecto `player`: el rol base de toda cuenta activa (`docs/06` §4). */
  roles: z.array(RolAsignable).default(["player"]),
  /** Obligatorio si algún rol es de ámbito de organización. */
  organizationId: z.string().optional(),
});

export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

export const UpdateUserRequest = z.object({
  fullName: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  membershipCategoryId: z.string().nullable().optional(),
});

export type UpdateUserRequest = z.infer<typeof UpdateUserRequest>;

export const UserResponse = z.object({
  id: z.string(),
  personId: z.string(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: z.enum(["invited", "active", "suspended", "archived"]),
  /**
   * Cuándo se envió la invitación vigente, si la cuenta sigue `invited` (HU-010-01, criterio 3).
   *
   * Es la respuesta a «¿le llegó?»: sin la fecha, un administrador no puede distinguir una
   * invitación de ayer de una de hace tres semanas, y reenvía a ciegas.
   */
  invitationSentAt: z.string().datetime().nullable(),
  roles: z.array(
    z.object({
      id: z.string(),
      role: z.string(),
      scope: z.enum(["platform", "club", "organization"]),
      scopeId: z.string().nullable(),
    }),
  ),
  membershipCategory: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  organizations: z.array(z.object({ id: z.string(), name: z.string() })),
});

export type UserResponse = z.infer<typeof UserResponse>;

/** Definir la primera contraseña con el enlace de invitación (HU-010-02). */
export const AcceptInvitationRequest = z
  .object({
    token: z.string().min(1),
    newPassword: z.string().min(1),
    newPasswordConfirmation: z.string().min(1),
    /**
     * Los datos que la persona completa de sí misma (HU-010-02, primer criterio).
     *
     * Sólo se aplican **si el club no los puso ya**: quien invita con nombre completo lo hizo por
     * algo —así aparece en la lista del club— y el enlace de invitación no es el lugar para que
     * alguien se renombre. Lo que llene aquí quien fue invitado sólo-con-correo sí queda.
     */
    fullName: z.string().min(1).max(120).optional(),
    phone: z.string().max(40).optional(),
  })
  .refine((datos) => datos.newPassword === datos.newPasswordConfirmation, {
    message: "Las dos contraseñas no coinciden.",
    path: ["newPasswordConfirmation"],
  });

export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequest>;

/**
 * Otorgar un rol.
 *
 * La organización va en **su propio campo** y no en un `scopeId` genérico, y la razón es que el
 * guard de permisos tiene que poder leerla *antes* de entrar al controlador: con un campo que a
 * veces trae un club y a veces una organización, resolver el ámbito exigiría interpretar el
 * `scope` desde el guard — o, peor, tratar el club como si fuera una organización, que es lo que
 * pasaba y devolvía `404`.
 *
 * El club nunca viaja en el cuerpo: es el del subdominio (R-020-01).
 */
export const AssignRoleRequest = z
  .object({
    role: RolAsignable,
    scope: z.enum(["club", "organization"]),
    organizationId: z.string().min(1).optional(),
  })
  .refine((datos) => datos.scope !== "organization" || datos.organizationId !== undefined, {
    message: "Un rol de organización necesita saber en cuál.",
    path: ["organizationId"],
  });

export type AssignRoleRequest = z.infer<typeof AssignRoleRequest>;
