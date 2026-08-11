import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { MeResponse } from "@polo/contracts";
import { ApiError, api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/**
 * Quién está del otro lado (T-125, `plan.md` §9.3.a).
 *
 * **Ésta es la única fuente de «¿hay sesión?» en toda la aplicación.** El token vive en una cookie
 * `httpOnly` que JavaScript no puede leer (`ADR-005`), así que el cliente no puede saberlo por su
 * cuenta: lo pregunta. Un `isLoggedIn` guardado en un store sería un booleano que el servidor
 * puede desmentir en cualquier momento —sesión revocada desde otro dispositivo, cuenta suspendida,
 * club suspendido— y esa desincronización se ve como una pantalla que alguien no tenía derecho a
 * ver.
 */
export function useSesion(): UseQueryResult<MeResponse | null, Error> {
  return useQuery({
    queryKey: queryKeys.yo,
    queryFn: async () => {
      try {
        return await api<MeResponse>("/me");
      } catch (error) {
        // Un `401` **no es un error de esta consulta**: es su respuesta. «No hay sesión» es un
        // resultado legítimo, y tratarlo como fallo dejaría la pantalla de ingreso mostrando un
        // mensaje de error a quien simplemente todavía no entró.
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }

        throw error;
      }
    },
  });
}
