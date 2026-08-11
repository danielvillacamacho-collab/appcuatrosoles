import { SetMetadata, type CustomDecorator } from "@nestjs/common";
import type { Permission } from "@polo/domain";

export const PERMISO_REQUERIDO = "permiso_requerido";

/**
 * Declara qué permiso exige una ruta (`docs/03` §6, `ADR-014` punto 4).
 *
 * ```ts
 * @RequirePermission("user.create")
 * @Post("users")
 * crear() { ... }
 * ```
 *
 * El argumento es del tipo `Permission` de `packages/domain`: **un permiso inventado no
 * compila**. Sin eso, un `@RequirePermission("user.crear")` con una errata pasaría la revisión y
 * dejaría la ruta exigiendo un permiso que nadie tiene —o peor, que el guard no sabe evaluar.
 *
 * Declararlo no basta y por eso existe `PermissionsDeclaredGuard`: toda ruta **mutante** que lo
 * omita impide arrancar la aplicación, en vez de quedar abierta esperando a que alguien lo note.
 */
export function RequirePermission(permission: Permission): CustomDecorator<string> {
  return SetMetadata(PERMISO_REQUERIDO, permission);
}
