import { SetMetadata, type CustomDecorator } from "@nestjs/common";
import type { Permission } from "@polo/domain";

export const PERMISO_REQUERIDO = "permiso_requerido";

/**
 * De dónde sale la organización sobre la que se actúa, cuando la ruta es de ámbito de organización.
 *
 * Sólo dos orígenes, y ninguno es «adivinar»: el parámetro de la ruta o un campo del cuerpo. Un
 * tercer origen —una cabecera, una query— sería una vía más por la que el cliente elige su propio
 * ámbito, que es lo que P-05 existe para impedir.
 */
export interface AmbitoDeOrganizacion {
  desde: "params" | "body";
  campo: string;
}

export interface OpcionesDePermiso {
  organizacion?: AmbitoDeOrganizacion;
}

/**
 * Declara qué permiso exige una ruta (`docs/03` §6, `ADR-014` punto 4).
 *
 * ```ts
 * @RequirePermission("user.create")
 * @Post("users")
 * crear() { ... }
 *
 * // Ruta de ámbito de organización: el guard evalúa contra ESA organización, no contra el club.
 * @RequirePermission("organization.manage", { organizacion: { desde: "params", campo: "id" } })
 * @Patch("organizations/:id")
 * editar() { ... }
 * ```
 *
 * El argumento es del tipo `Permission` de `packages/domain`: **un permiso inventado no
 * compila**. Sin eso, un `@RequirePermission("user.crear")` con una errata pasaría la revisión y
 * dejaría la ruta exigiendo un permiso que nadie tiene —o peor, que el guard no sabe evaluar.
 *
 * Declararlo no basta y por eso existe `PermissionsDeclaredGuard`: toda ruta **mutante** que lo
 * omita impide arrancar la aplicación, en vez de quedar abierta esperando a que alguien lo note.
 */
export function RequirePermission(
  permission: Permission,
  opciones: OpcionesDePermiso = {},
): CustomDecorator<string> {
  return SetMetadata(PERMISO_REQUERIDO, { permission, ...opciones });
}

/** Lo que guarda el decorador. Lo lee `PermissionGuard`. */
export interface PermisoDeclarado extends OpcionesDePermiso {
  permission: Permission;
}
