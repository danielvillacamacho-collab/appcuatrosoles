import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { AdjustTeamsRequest, PracticeTeamsResponse } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/**
 * Los equipos de una práctica.
 *
 * `retry: false`: a quien no puede ver un borrador el API le responde **404** (R-051-05), y
 * reintentarlo sólo demora el momento en que la pantalla deja de decir «cargando».
 */
export function useEquipos(practiceId: string): UseQueryResult<PracticeTeamsResponse, Error> {
  return useQuery({
    queryKey: queryKeys.practicas.equipos(practiceId),
    queryFn: () => api<PracticeTeamsResponse>(`/practices/${practiceId}/teams`),
    retry: false,
  });
}

function invalidar(
  queryClient: ReturnType<typeof useQueryClient>,
  practiceId: string,
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.practicas.detalle(practiceId) });
}

export function useProponerEquipos(
  practiceId: string,
): UseMutationResult<PracticeTeamsResponse, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api<PracticeTeamsResponse>(`/practices/${practiceId}/teams/propose`, {
        method: "POST",
        body: {},
      }),
    onSuccess: () => invalidar(queryClient, practiceId),
  });
}

export function useAjustarEquipos(
  practiceId: string,
): UseMutationResult<PracticeTeamsResponse, Error, AdjustTeamsRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cambios: AdjustTeamsRequest) =>
      api<PracticeTeamsResponse>(`/practices/${practiceId}/teams`, {
        method: "PATCH",
        body: cambios,
      }),
    onSuccess: () => invalidar(queryClient, practiceId),
  });
}

export function useAprobarEquipos(
  practiceId: string,
): UseMutationResult<PracticeTeamsResponse, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api<PracticeTeamsResponse>(`/practices/${practiceId}/teams/approve`, {
        method: "POST",
        body: {},
      }),
    onSuccess: () => invalidar(queryClient, practiceId),
  });
}
