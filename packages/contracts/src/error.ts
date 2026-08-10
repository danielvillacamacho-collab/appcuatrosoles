import { z } from "zod";

/**
 * docs/03-api-conventions.md §2 — forma única de error en todo el API. `code` es estable y
 * forma parte del contrato; `message` puede cambiar de redacción sin romper al cliente.
 */
export const ApiErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponse>;
