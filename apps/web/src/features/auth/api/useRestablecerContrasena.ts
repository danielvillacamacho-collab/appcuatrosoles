import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { ResetPasswordRequest } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";

/**
 * Usar el enlace de restablecimiento (T-129, HU-010-06).
 *
 * No hay nada que invalidar: el API **revoca todas las sesiones** al cambiar la contraseña
 * (R-010-09), así que quien estaba dentro en este navegador tampoco lo está ya. La pantalla lo
 * dice y manda a ingresar, que es lo único que se puede hacer después.
 */
export function useRestablecerContrasena(): UseMutationResult<undefined, Error, ResetPasswordRequest> {
  return useMutation({
    mutationFn: (datos: ResetPasswordRequest) =>
      api<undefined>("/auth/password/reset", { method: "POST", body: datos }),
  });
}
