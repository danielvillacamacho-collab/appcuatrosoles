import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  BlockFieldRequest,
  CreateFieldRequest,
  FieldBookingResponse,
  FieldResponse,
  UpdateFieldRequest,
} from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

export function useCanchas(incluirArchivadas = false): UseQueryResult<FieldResponse[], Error> {
  return useQuery({
    queryKey: [...queryKeys.canchas, { incluirArchivadas }],
    queryFn: () =>
      api<FieldResponse[]>(`/fields${incluirArchivadas ? "?incluirArchivadas=true" : ""}`),
  });
}

export function useCrearCancha(): UseMutationResult<FieldResponse, Error, CreateFieldRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: CreateFieldRequest) =>
      api<FieldResponse>("/fields", { method: "POST", body: datos }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.canchas });
    },
  });
}

export function useEditarCancha(
  id: string,
): UseMutationResult<FieldResponse, Error, UpdateFieldRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cambios: UpdateFieldRequest) =>
      api<FieldResponse>(`/fields/${id}`, { method: "PATCH", body: cambios }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.canchas });
    },
  });
}

export function useArchivarCancha(): UseMutationResult<FieldResponse, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api<FieldResponse>(`/fields/${id}/archive`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.canchas });
    },
  });
}

/**
 * Bloquear una franja (T-462).
 *
 * Invalida **el calendario entero**, no un día: el bloqueo puede caer en cualquier día que alguna
 * pestaña tenga en caché, y la clave por día hace barato invalidar el prefijo.
 */
export function useBloquearFranja(): UseMutationResult<FieldBookingResponse, Error, BlockFieldRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: BlockFieldRequest) =>
      api<FieldBookingResponse>("/field-bookings/block", { method: "POST", body: datos }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

export function useLevantarBloqueo(): UseMutationResult<undefined, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api<undefined>(`/field-bookings/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}
