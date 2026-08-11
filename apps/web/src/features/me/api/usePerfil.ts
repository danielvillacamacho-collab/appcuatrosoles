import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type {
  ConfirmEmailChangeRequest,
  MeResponse,
  RequestEmailChangeRequest,
  UpdateMeRequest,
} from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/**
 * Editar el propio perfil (T-130, HU-010-07).
 *
 * Manda **sólo teléfono y foto**, que es lo que el contrato acepta. Nombre, categoría y roles los
 * administra el club: mandarlos no daría error —el API los descarta en silencio— pero enviarlos
 * desde aquí haría creer que la pantalla los cambia.
 */
export function useEditarPerfil(): UseMutationResult<MeResponse, Error, UpdateMeRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cambios: UpdateMeRequest) => api<MeResponse>("/me", { method: "PATCH", body: cambios }),
    onSuccess: (perfil) => {
      // La respuesta ya es el perfil completo: sembrarla evita el parpadeo de volver a consultar
      // para pintar lo mismo que acabamos de recibir.
      queryClient.setQueryData(queryKeys.yo, perfil);
    },
  });
}

/**
 * Pedir el cambio del correo de acceso (T-130, HU-010-07).
 *
 * **El correo anterior sigue valiendo** hasta que se confirme el nuevo: el API guarda el pendiente
 * y manda el enlace al buzón nuevo. Se invalida el perfil para que la pantalla muestre de inmediato
 * que hay uno esperando confirmación — sin eso, la persona repite la solicitud creyendo que no
 * pasó nada.
 */
export function usePedirCambioDeCorreo(): UseMutationResult<
  { mensaje: string },
  Error,
  RequestEmailChangeRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: RequestEmailChangeRequest) =>
      api<{ mensaje: string }>("/me/email-change", { method: "POST", body: datos }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.yo });
    },
  });
}

export function useConfirmarCambioDeCorreo(): UseMutationResult<
  undefined,
  Error,
  ConfirmEmailChangeRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: ConfirmEmailChangeRequest) =>
      api<undefined>("/me/email-change/confirm", { method: "POST", body: datos }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.yo });
    },
  });
}
