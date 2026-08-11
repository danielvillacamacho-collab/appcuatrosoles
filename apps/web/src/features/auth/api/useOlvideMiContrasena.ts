import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { ForgotPasswordRequest } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";

/**
 * Pedir el enlace para restablecer la contraseña (T-124/T-129, HU-010-06).
 *
 * El API responde `202` exista o no la cuenta, y esta pantalla no intenta averiguar cuál fue: no
 * hay nada en la respuesta que lo diga, y ése es el punto (R-010-07, P-12).
 */
export function useOlvideMiContrasena(): UseMutationResult<undefined, Error, ForgotPasswordRequest> {
  return useMutation({
    mutationFn: (datos: ForgotPasswordRequest) =>
      api<undefined>("/auth/password/forgot", { method: "POST", body: datos }),
  });
}
