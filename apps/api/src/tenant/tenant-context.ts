/**
 * El club al que pertenece la solicitud, resuelto por `TenantGuard` a partir del host.
 *
 * Vive aquí y no en el guard que lo consume porque lo leen varios: `PermissionGuard` (T-022b),
 * `AuditInterceptor` (T-023) y, de aquí en adelante, todo repositorio que filtre por club.
 *
 * **Nunca lo pone el cliente.** Un `clubId` que llegue en el cuerpo, la ruta o una cabecera no
 * determina el tenant (R-020-01, P-05): lo determina el subdominio, y sólo el guard escribe aquí.
 */
export interface ConTenant {
  tenant?: { clubId: string };
}
