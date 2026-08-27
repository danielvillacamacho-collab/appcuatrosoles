import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  AdjustGridRequest,
  ClubHandicapListResponse,
  NoShowRequest,
  PracticeGridResponse,
} from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/**
 * La grilla de chukkers de una práctica (`specs/052`).
 *
 * `retry: false` con el mismo criterio que los equipos: una práctica sin equipos aprobados no tiene
 * grilla y responde **404**, y reintentarlo sólo demora el momento en que la pantalla lo dice.
 */
export function useGrilla(practiceId: string): UseQueryResult<PracticeGridResponse, Error> {
  return useQuery({
    queryKey: queryKeys.practicas.grilla(practiceId),
    queryFn: () => api<PracticeGridResponse>(`/practices/${practiceId}/grid`),
    retry: false,
  });
}

function invalidar(
  queryClient: ReturnType<typeof useQueryClient>,
  practiceId: string,
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.practicas.detalle(practiceId) });
}

/**
 * Corregir la grilla.
 *
 * Manda **los cambios**, no la grilla entera: son celdas independientes, así que dos correcciones
 * simultáneas en chukkers distintos no son un conflicto que resolver.
 */
export function useAjustarGrilla(
  practiceId: string,
): UseMutationResult<PracticeGridResponse, Error, AdjustGridRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cambios: AdjustGridRequest) =>
      api<PracticeGridResponse>(`/practices/${practiceId}/grid`, { method: "PATCH", body: cambios }),
    onSuccess: () => invalidar(queryClient, practiceId),
  });
}

export function useMarcarAusente(
  practiceId: string,
): UseMutationResult<PracticeGridResponse, Error, NoShowRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (peticion: NoShowRequest) =>
      api<PracticeGridResponse>(`/practices/${practiceId}/grid/no-show`, {
        method: "POST",
        body: peticion,
      }),
    onSuccess: () => invalidar(queryClient, practiceId),
  });
}

/** Cerrar y reabrir: lo mismo con distinta ruta, así que un solo hook con bandera. */
export function useCerrarPractica(
  practiceId: string,
): UseMutationResult<PracticeGridResponse, Error, { cerrar: boolean }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cerrar }: { cerrar: boolean }) =>
      api<PracticeGridResponse>(`/practices/${practiceId}/${cerrar ? "close" : "reopen"}`, {
        method: "POST",
        body: {},
      }),
    onSuccess: () => invalidar(queryClient, practiceId),
  });
}

/**
 * Las personas del club, para elegir a quien entra en una sustitución.
 *
 * **Sale del listado de handicaps y no del de usuarios**, y eso no es un rodeo: `GET /users` exige
 * `user.edit`, que el comisario no tiene ni debe tener. Es el mismo agujero que apareció en
 * `specs/030` T-343 —el único rol que podía fijar un handicap no tenía cómo llegar a la pantalla— y
 * la misma salida: el listado del club ya existe, ya es público dentro del club, y trae los
 * nombres.
 *
 * El filtro es **del lado del cliente**: la ruta no recibe búsqueda, y un club son decenas de
 * personas, no miles. Agregar un parámetro al API para esto sería trabajo sin problema que resolver.
 */
export function usePersonasDelClub(
  busqueda: string,
): UseQueryResult<{ personId: string; fullName: string }[], Error> {
  return useQuery({
    queryKey: queryKeys.handicaps.todos,
    queryFn: () => api<ClubHandicapListResponse>(`/handicaps?limit=200`),
    select: (respuesta) =>
      respuesta.items
        .filter((fila) => fila.fullName.toLowerCase().includes(busqueda.trim().toLowerCase()))
        .map((fila) => ({ personId: fila.personId, fullName: fila.fullName })),
  });
}
