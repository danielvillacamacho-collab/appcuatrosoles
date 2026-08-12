import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  ApplyToPracticeRequest,
  CreatePracticeRequest,
  PracticeResponse,
} from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

export function usePracticas(): UseQueryResult<PracticeResponse[], Error> {
  return useQuery({
    queryKey: queryKeys.practicas.todas,
    queryFn: () => api<PracticeResponse[]>("/practices"),
    // El tablero es la pantalla de «¿voy o no voy?»: mejor una consulta de más que un cupo que ya
    // se llenó mostrándose libre.
    staleTime: 15_000,
  });
}

export function usePractica(id: string): UseQueryResult<PracticeResponse, Error> {
  return useQuery({
    queryKey: queryKeys.practicas.detalle(id),
    queryFn: () => api<PracticeResponse>(`/practices/${id}`),
    retry: false,
  });
}

/** Todas las mutaciones invalidan la raíz: el cupo de una cambia lo que ve el tablero. */
function invalidarTodo(queryClient: ReturnType<typeof useQueryClient>): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.practicas.todas });
}

export function usePostularme(
  practiceId: string,
): UseMutationResult<undefined, Error, ApplyToPracticeRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: ApplyToPracticeRequest) =>
      api<undefined>(`/practices/${practiceId}/applications`, { method: "POST", body: datos }),
    onSuccess: () => invalidarTodo(queryClient),
  });
}

export function useRetirarme(practiceId: string): UseMutationResult<undefined, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api<undefined>(`/practices/${practiceId}/applications/mine`, { method: "DELETE" }),
    onSuccess: () => invalidarTodo(queryClient),
  });
}

export function useAceptarPareja(practiceId: string): UseMutationResult<undefined, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (companeroPersonId: string) =>
      api<undefined>(`/practices/${practiceId}/applications/mine/accept-partner`, {
        method: "POST",
        body: { companeroPersonId },
      }),
    onSuccess: () => invalidarTodo(queryClient),
  });
}

export function useCrearPractica(): UseMutationResult<
  PracticeResponse,
  Error,
  CreatePracticeRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: CreatePracticeRequest) =>
      api<PracticeResponse>("/practices", { method: "POST", body: datos }),
    onSuccess: () => invalidarTodo(queryClient),
  });
}

export function usePublicarPractica(): UseMutationResult<PracticeResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api<PracticeResponse>(`/practices/${id}/publish`, { method: "POST", body: {} }),
    onSuccess: () => invalidarTodo(queryClient),
  });
}

export function useCancelarPractica(
  practiceId: string,
): UseMutationResult<PracticeResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reason: string) =>
      api<PracticeResponse>(`/practices/${practiceId}/cancel`, { method: "POST", body: { reason } }),
    onSuccess: () => invalidarTodo(queryClient),
  });
}
