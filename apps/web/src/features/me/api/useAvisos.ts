import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  NotificationPreferenceResponse,
  UpdateNotificationPreferencesRequest,
} from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/** Qué avisos recibe uno (T-132, T-091). */
export function useAvisos(): UseQueryResult<NotificationPreferenceResponse[], Error> {
  return useQuery({
    queryKey: queryKeys.misAvisos,
    queryFn: () => api<NotificationPreferenceResponse[]>("/me/notification-preferences"),
  });
}

/**
 * Cambiar una preferencia.
 *
 * La respuesta del API **es la lista completa ya recalculada**, así que se siembra directamente en
 * vez de invalidar: es lo que hace que el interruptor no parpadee entre encendido y apagado
 * mientras llega una segunda consulta que va a decir lo mismo.
 */
export function useCambiarAvisos(): UseMutationResult<
  NotificationPreferenceResponse[],
  Error,
  UpdateNotificationPreferencesRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: UpdateNotificationPreferencesRequest) =>
      api<NotificationPreferenceResponse[]>("/me/notification-preferences", {
        method: "PATCH",
        body: datos,
      }),
    onSuccess: (preferencias) => {
      queryClient.setQueryData(queryKeys.misAvisos, preferencias);
    },
  });
}
