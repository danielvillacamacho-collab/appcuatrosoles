import { z } from "zod";

/**
 * Contratos del módulo 020 (`specs/020` plan §3).
 *
 * El formato del `slug` se valida además en `packages/domain/tenant/slug.ts` y en un `CHECK` de la
 * base: tres capas, y no es redundancia ociosa — el contrato da el mensaje al usuario, el dominio
 * decide, y la base garantiza. Hay tests de integración que comparan las tres (T-210).
 */
export const CreateClubRequest = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(63),
  /** IANA. Se valida contra `Intl` en el servicio: una lista propia envejece mal. */
  timezone: z.string().min(1).default("America/Bogota"),
  currency: z.string().length(3).default("COP"),
  /** A quién se invita como primer administrador del club. */
  adminEmail: z.string().email(),
  adminFullName: z.string().min(1).max(120),
});

export type CreateClubRequest = z.infer<typeof CreateClubRequest>;

export const ClubResponse = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  timezone: z.string(),
  currency: z.string(),
  status: z.enum(["active", "suspended"]),
});

export type ClubResponse = z.infer<typeof ClubResponse>;

/**
 * Lo único que se sirve **sin sesión**, en el subdominio del club (HU-020-09).
 *
 * Deliberadamente pobre: todo campo que se agregue aquí es información que cualquiera puede leer
 * apuntando al subdominio. Hay un test que compara la respuesta campo por campo contra esta lista.
 */
export const ClubPublicResponse = z.object({
  name: z.string(),
  timezone: z.string(),
});

export type ClubPublicResponse = z.infer<typeof ClubPublicResponse>;

export const SuspendClubRequest = z.object({
  reason: z.string().min(1).max(500),
});

export type SuspendClubRequest = z.infer<typeof SuspendClubRequest>;
