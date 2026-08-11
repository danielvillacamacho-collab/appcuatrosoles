/**
 * Dominio de la instalación, contra el cual se recorta el subdominio de cada solicitud.
 *
 * Es **configuración del despliegue**, no del club (`docs/07`): la misma imagen sirve a `polo.app`
 * en producción y a `localhost` en desarrollo. Se inyecta como token para que ningún componente lo
 * lea de `process.env` por su cuenta — así el valor tiene un solo origen y un test puede
 * sustituirlo sin tocar el entorno del proceso.
 *
 * Vive en su propio archivo y no en `tenant.module.ts` por una razón concreta: el guard necesita el
 * token y el módulo necesita el guard, así que tenerlo en el módulo crea una dependencia circular
 * que NestJS detecta al arrancar. Costó un test en rojo descubrirlo.
 */
export const BASE_DOMAIN = Symbol("BaseDomain");

/**
 * `localhost` por defecto para que un `pnpm dev` recién clonado funcione sin configurar nada. En el
 * despliegue, `BASE_DOMAIN` es obligatorio y su ausencia se nota de inmediato: ningún subdominio
 * real resolvería.
 */
export function baseDomainDelEntorno(): string {
  return process.env.BASE_DOMAIN ?? "localhost";
}
