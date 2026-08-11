import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { CalendarResponse } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/** El día por cancha, ya filtrado por privacidad **en el servidor** (T-450). */
export function useCalendario(date: string): UseQueryResult<CalendarResponse, Error> {
  return useQuery({
    queryKey: queryKeys.calendario(date),
    queryFn: () => api<CalendarResponse>(`/calendar?date=${date}`),
    // El calendario es la pantalla de operación diaria: mejor una consulta de más que una franja
    // que ya se ocupó mostrándose libre.
    staleTime: 15_000,
  });
}
