import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ClubPublicResponse } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/**
 * El club de este subdominio, sin sesión (HU-020-09).
 *
 * Es lo que hace que la pantalla de ingreso diga «Club Los Pinos» y no «Cuatro Soles» a secas:
 * quien entra por `lospinos.polo.app` tiene que ver su club antes de escribir su contraseña, o no
 * sabe si está en el lugar correcto.
 *
 * **El club sale del `Host`, nunca de un parámetro** (`ADR-013`, P-05): esta consulta no manda
 * ningún identificador, y por eso no hay forma de que la interfaz pida el club de otro.
 */
export function useClub(): UseQueryResult<ClubPublicResponse, Error> {
  return useQuery({
    queryKey: queryKeys.club,
    queryFn: () => api<ClubPublicResponse>("/clubs/current/public"),
    // El nombre de un club no cambia durante una sesión de uso; volver a pedirlo en cada pantalla
    // es tráfico por nada.
    staleTime: 10 * 60_000,
  });
}
