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
  /**
   * Marca la ruta como de **ámbito de plataforma**: no actúa dentro de un club sino sobre la
   * plataforma misma (dar de alta clubes, configuración global).
   *
   * Existe porque esas rutas no tienen tenant —no llegan por el subdominio de ningún club— y sin
   * decirlo el guard exigiría uno y respondería error interno. Que haya que declararlo, en vez de
   * deducirlo del permiso, es a propósito: convertir una ruta en «de plataforma» es una decisión
   * de seguridad y tiene que verse en la ruta.
   */
  plataforma?: true;
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

export const SIN_PERMISO = "sin_permiso";

/**
 * Declara que una ruta mutante **no exige permiso**, y por qué.
 *
 * Dos familias de casos legítimos, y conviene distinguirlas al leer el motivo:
 *
 * 1. **Rutas públicas**: iniciar sesión, pedir un restablecimiento de contraseña. Exigir autoridad
 *    es imposible — son justamente lo que uno usa *antes* de tenerla.
 * 2. **Rutas autenticadas sin permiso**: cerrar la sesión propia, cambiar la propia contraseña. Hay
 *    sesión, pero no hay nada que autorizar: cada quien manda sobre lo suyo.
 *
 * **Pide el motivo por escrito, y el arranque falla si está vacío.** La alternativa —dejar que una
 * ruta mutante simplemente no declare nada— convertiría la comprobación de `ADR-014` punto 4 en
 * una formalidad: cualquiera podría saltarla olvidándose. Así, saltarla es una decisión que queda
 * escrita en la ruta y se lee en la revisión.
 */
export function SinPermiso(razon: string): CustomDecorator<string> {
  return SetMetadata(SIN_PERMISO, razon);
}
