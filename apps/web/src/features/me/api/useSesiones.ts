import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { SessionResponse } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/** Los dispositivos con sesión abierta (T-131, HU-010-05). */
export function useSesiones(): UseQueryResult<SessionResponse[], Error> {
  return useQuery({
    queryKey: queryKeys.misSesiones,
    queryFn: () => api<SessionResponse[]>("/me/sessions"),
    // Una lista de dispositivos vieja es exactamente lo que alguien no quiere ver cuando entra a
    // esta pantalla porque sospecha que le robaron la cuenta.
    staleTime: 0,
  });
}

export function useCerrarSesion(): UseMutationResult<undefined, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api<undefined>(`/me/sessions/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.misSesiones });
    },
  });
}

/**
 * Cerrar todas, **incluida la actual** (HU-010-05).
 *
 * Media desconexión no tranquiliza a nadie: quien usa esto cree que alguien más tiene su cuenta.
 * Por eso el API cierra también la de aquí, y la pantalla manda a ingresar.
 */
export function useCerrarTodas(): UseMutationResult<undefined, Error, undefined> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api<undefined>("/auth/logout-all", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
    },
  });
}
