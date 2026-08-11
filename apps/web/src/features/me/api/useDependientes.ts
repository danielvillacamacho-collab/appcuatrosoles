import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { DependentResponse } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/** Los perfiles a cargo de quien pregunta (T-133, HU-010-10). */
export function useDependientes(): UseQueryResult<DependentResponse[], Error> {
  return useQuery({
    queryKey: queryKeys.misDependientes,
    queryFn: () => api<DependentResponse[]>("/me/dependents"),
  });
}
