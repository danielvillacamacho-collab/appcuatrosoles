import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { LoginRequest, LoginResponse } from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

/**
 * Iniciar sesión (T-124).
 *
 * Al entrar **se limpia toda la caché**, no sólo `me`. Sin eso, quedarían en memoria las respuestas
 * de quien usó el navegador antes —el listado de usuarios de un administrador, por ejemplo— y la
 * siguiente persona vería por un instante datos que no le corresponden. En un club donde el
 * computador de la administración lo usan varios, ese instante ocurre todos los días.
 */
export function useLogin(): UseMutationResult<LoginResponse, Error, LoginRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: LoginRequest) => api<LoginResponse>("/auth/login", { method: "POST", body: datos }),
    onSuccess: async () => {
      queryClient.clear();

      // **No se siembra la caché de `/me` con la respuesta del login**, aunque tentaría: el login
      // devuelve quién entró —nombre, correo, identificadores— y `/me` devuelve además sus roles,
      // sus organizaciones y su categoría. Sembrarla con lo que hay dejaría el panel pintando una
      // persona sin ningún rol hasta que llegara la consulta de verdad.
      await queryClient.invalidateQueries({ queryKey: queryKeys.yo });
    },
  });
}
