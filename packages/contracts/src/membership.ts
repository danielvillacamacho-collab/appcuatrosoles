import { z } from "zod";

/**
 * La cuota viaja como **entero de centavos** (P-02) y el campo lo dice en su nombre. Un número con
 * decimales para dinero es la clase de error que no se ve hasta que alguien cobra de más.
 */
export const CreateMembershipCategoryRequest = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  monthlyFeeCents: z.number().int().min(0),
  rights: z.record(z.string(), z.unknown()).default({}),
});

export type CreateMembershipCategoryRequest = z.infer<typeof CreateMembershipCategoryRequest>;

export const UpdateMembershipCategoryRequest = z.object({
  name: z.string().min(1).max(80).optional(),
  monthlyFeeCents: z.number().int().min(0).optional(),
  rights: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
});

export type UpdateMembershipCategoryRequest = z.infer<typeof UpdateMembershipCategoryRequest>;

export const MembershipCategoryResponse = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  monthlyFeeCents: z.number().int(),
  rights: z.record(z.string(), z.unknown()),
  active: z.boolean(),
});

export type MembershipCategoryResponse = z.infer<typeof MembershipCategoryResponse>;
