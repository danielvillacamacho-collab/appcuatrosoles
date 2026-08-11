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
  fullName: z.string().min(1).max(120),
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
  })
  .refine((datos) => datos.newPassword === datos.newPasswordConfirmation, {
    message: "Las dos contraseñas no coinciden.",
    path: ["newPasswordConfirmation"],
  });

export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequest>;

export const AssignRoleRequest = z.object({
  role: RolAsignable,
  scope: z.enum(["club", "organization"]),
  /** El club o la organización. Para `club` debe ser el club del subdominio. */
  scopeId: z.string().min(1),
});

export type AssignRoleRequest = z.infer<typeof AssignRoleRequest>;
