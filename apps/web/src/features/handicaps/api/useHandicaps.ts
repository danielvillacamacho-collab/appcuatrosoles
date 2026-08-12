import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  HandicapHistoryResponse,
  HandicapTypeName,
  PersonHandicapsResponse,
  SetHandicapRequest,
} from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

export function useHandicaps(personId: string): UseQueryResult<PersonHandicapsResponse, Error> {
  return useQuery({
    queryKey: queryKeys.handicaps.dePersona(personId),
    queryFn: () => api<PersonHandicapsResponse>(`/people/${personId}/handicaps`),
  });
}

/**
 * El historial.
 *
 * `retry: false` a propósito: a quien no puede verlo el API le responde **404** (R-030-09), y
 * reintentar un 404 sólo demora el momento en que la pantalla deja de mostrar «cargando».
 */
export function useHistorialDeHandicap(
  personId: string,
  habilitada: boolean,
): UseQueryResult<HandicapHistoryResponse, Error> {
  return useQuery({
    queryKey: queryKeys.handicaps.historial(personId),
    queryFn: () => api<HandicapHistoryResponse>(`/people/${personId}/handicaps/history`),
    enabled: habilitada,
    retry: false,
  });
}

export function useFijarHandicap(
  personId: string,
  tipo: HandicapTypeName,
): UseMutationResult<PersonHandicapsResponse, Error, SetHandicapRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: SetHandicapRequest) =>
      api<PersonHandicapsResponse>(`/people/${personId}/handicaps/${tipo}`, {
        method: "PUT",
        body: datos,
      }),
    onSuccess: async () => {
      // El vigente y el historial cambian juntos en el servidor; que se refresquen juntos aquí.
      await queryClient.invalidateQueries({ queryKey: queryKeys.handicaps.todos });
    },
  });
}
