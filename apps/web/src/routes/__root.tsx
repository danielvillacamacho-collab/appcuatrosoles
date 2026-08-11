import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { ApiError } from "../lib/api-client.js";

/**
 * La raíz de la aplicación: los proveedores y nada más (T-121).
 *
 * Todo lo que viva aquí lo pagan **todas** las pantallas, así que sólo entra lo que de verdad es
 * de todas.
 */
export const Route = createRootRoute({ component: Raiz });

/**
 * La configuración de TanStack Query, que son cuatro decisiones y no una preferencia.
 *
 * - **No se reintenta un error del API.** Un `403` o un `422` no mejoran repitiéndolos: son la
 *   respuesta correcta a lo que se pidió. Reintentar sólo tiene sentido cuando falló el camino
 *   —sin red, servidor caído— y ahí sí se intenta una vez más.
 * - **Un `401` no se reintenta nunca**: la sesión terminó, y repetir la consulta sólo retrasa la
 *   redirección a la pantalla de ingreso.
 * - **`staleTime` de 30 segundos** para que moverse entre pantallas no dispare la misma consulta
 *   tres veces. Es corto a propósito: esto es una plataforma de operación diaria, y ver una lista
 *   vieja de inscritos a una práctica es peor que una consulta de más.
 * - **Nada de reintentos en las mutaciones.** Repetir un `POST` que quizá sí llegó es la forma de
 *   crear dos usuarios, dos cobros o dos inscripciones.
 */
export function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (intentos, error) => !(error instanceof ApiError) && intentos < 1,
      },
      mutations: { retry: false },
    },
  });
}

const queryClient = crearQueryClient();

function Raiz(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
