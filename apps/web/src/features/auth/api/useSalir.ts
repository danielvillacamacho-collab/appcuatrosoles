import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { api } from "../../../lib/api-client.js";

/**
 * Cerrar sesión (HU-010-05).
 *
 * **La caché se limpia entera, y se limpia pase lo que pase.** Si el `POST` falla —sin red, por
 * ejemplo— igual se borra lo que había en memoria: dejar el listado de socios en la caché de un
 * computador compartido porque el servidor no contestó es exactamente lo que esta pantalla debía
 * evitar. La cookie la mata el servidor cuando vuelva a haber conexión; lo que está en este
 * navegador se borra ya.
 */
export function useSalir(): UseMutationResult<undefined, Error, undefined> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api<undefined>("/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
    },
  });
}
