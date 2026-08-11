import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { AcceptInvitationRequest } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";

/**
 * Definir la primera contraseña con el enlace de invitación (T-126, HU-010-02).
 *
 * No hay nada que invalidar después: al aceptar **todavía no hay sesión** —el API activa la cuenta
 * pero no abre sesión— así que la pantalla manda a ingresar. Es deliberado del lado del API:
 * quien acaba de definir una contraseña debería probarla de una vez, y no descubrir mañana que
 * escribió otra cosa.
 */
export function useAceptarInvitacion(): UseMutationResult<undefined, Error, AcceptInvitationRequest> {
  return useMutation({
    mutationFn: (datos: AcceptInvitationRequest) =>
      api<undefined>("/auth/invitation/accept", { method: "POST", body: datos }),
  });
}
