import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { MembershipCategoryResponse, OrganizationResponse } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/**
 * Lo que llena los selectores: organizaciones y categorías de membresía.
 *
 * Cambian muy poco, así que se piden una vez y se reusan en cada pantalla que las necesite. Sin un
 * `staleTime` largo, abrir tres veces el formulario de crear usuario son tres consultas para
 * pintar la misma lista de cinco categorías.
 */
export function useOrganizaciones(): UseQueryResult<OrganizationResponse[], Error> {
  return useQuery({
    queryKey: queryKeys.organizaciones,
    queryFn: () => api<OrganizationResponse[]>("/organizations"),
    staleTime: 10 * 60_000,
  });
}

export function useCategorias(): UseQueryResult<MembershipCategoryResponse[], Error> {
  return useQuery({
    queryKey: queryKeys.categorias,
    queryFn: () => api<MembershipCategoryResponse[]>("/membership-categories"),
    staleTime: 10 * 60_000,
  });
}
