import type { MeResponse } from "@polo/contracts";
import { ROLE_SCOPES, canAssignRole, type RoleName, type ScopeKind } from "@polo/domain";

/**
 * Qué roles puede ofrecer esta pantalla a quien la está usando (T-135, R-010-04).
 *
 * **Usa `canAssignRole` de `packages/domain`, la misma función que aplica el API.** No es duplicar
 * la regla: es la regla, importada. Ofrecer un rol que el servidor va a rechazar hace perder el
 * tiempo dos veces —al llenar el formulario y al leer el error— y enseña a desconfiar de la
 * pantalla.
 *
 * Esconder el rol **no es la protección**: el API decide en cada petición (`docs/06` §4). Esto es
 * cortesía; la barrera está del otro lado.
 */
export function rolesQuePuedeOtorgar(
  usuario: MeResponse,
  ambito: { scope: ScopeKind; scopeId: string | null; clubId: string | null },
): RoleName[] {
  const actor = {
    roles: usuario.roles.map((rol) => ({
      role: rol.role as RoleName,
      scope: rol.scope,
      scopeId: rol.scopeId,
    })),
  };

  return (Object.keys(ROLE_SCOPES) as RoleName[]).filter(
    (role) =>
      // `player` se ofrece igual que los demás: es el rol base de toda cuenta y el formulario de
      // alta lo trae marcado por defecto.
      canAssignRole(actor, { role, scope: ambito.scope, scopeId: ambito.scopeId, clubId: ambito.clubId })
        .ok,
  );
}

/**
 * El club en el que manda quien está usando la pantalla.
 *
 * Sale de sus propias asignaciones y **nunca de un parámetro**: el tenant lo resuelve el servidor
 * por el subdominio (`ADR-013`, P-05). Aquí sólo se necesita para preguntarle al dominio si puede
 * otorgar algo, y un superadministrador no tiene club — de ahí el `null`.
 */
export function clubDelActor(usuario: MeResponse): string | null {
  return usuario.roles.find((rol) => rol.scope === "club")?.scopeId ?? null;
}
