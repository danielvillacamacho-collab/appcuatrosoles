/**
 * Roles y ámbitos del sistema (docs/02 §B, docs/06 §4).
 *
 * Vocabulario propio del dominio, no el enum de Prisma (P-01). Ver la nota en `accountStatus.ts`.
 */

export const ROLE_NAMES = [
  "superadmin",
  "club_admin",
  "organization_admin",
  "commissioner",
  "instructor",
  "groom",
  "treasurer",
  "player",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const SCOPE_KINDS = ["platform", "club", "organization"] as const;

export type ScopeKind = (typeof SCOPE_KINDS)[number];

/**
 * Ámbitos en los que cada rol tiene sentido. No es una restricción cosmética: un «comisario de
 * una organización» o un «superadministrador de un club» no significan nada, y permitirlos deja
 * asignaciones que después nadie sabe cómo evaluar.
 *
 * `treasurer` es el único que vive en dos ámbitos: el club tiene su tesorería y cada organización
 * puede tener la suya (docs/06 §4).
 */
export const ROLE_SCOPES: Record<RoleName, readonly ScopeKind[]> = {
  superadmin: ["platform"],
  club_admin: ["club"],
  commissioner: ["club"],
  player: ["club"],
  organization_admin: ["organization"],
  instructor: ["organization"],
  groom: ["organization"],
  treasurer: ["club", "organization"],
};

export function roleAllowsScope(role: RoleName, scope: ScopeKind): boolean {
  return ROLE_SCOPES[role].includes(scope);
}
