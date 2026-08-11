import type { ConTenant } from "../tenant/tenant-context.js";

/**
 * El club de la solicitud, o un error si no hay.
 *
 * Existe para que ningún controlador escriba `req.tenant!.clubId`: la aserción no-nula está
 * prohibida en el repo, y con razón — es la forma más corta de convertir «el guard no corrió» en
 * un error incomprensible tres capas más abajo. Si falta, es un error de programación y se dice
 * así: `TenantGuard` no está montado en esa ruta.
 */
export function clubDeLaSolicitud(req: ConTenant): string {
  const tenant = req.tenant;

  if (tenant === undefined) {
    throw new Error("Ruta sin TenantGuard: no hay club en la solicitud (T-221).");
  }

  return tenant.clubId;
}
