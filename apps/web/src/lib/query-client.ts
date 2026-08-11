import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-client.js";

/**
 * La caché de consultas, con las cuatro decisiones que no son preferencias (T-121).
 *
 * - **No se reintenta un error del API.** Un `403` o un `422` no mejoran repitiéndolos: son la
 *   respuesta correcta a lo que se pidió. Reintentar sólo tiene sentido cuando falló el camino
 *   —sin red, servidor caído— y ahí sí se intenta una vez más.
 * - **Un `401` tampoco**: la sesión terminó, y repetir la consulta sólo retrasa la redirección a la
 *   pantalla de ingreso.
 * - **`staleTime` de 30 segundos**, para que moverse entre pantallas no dispare la misma consulta
 *   tres veces. Corto a propósito: esto es una plataforma de operación diaria, y ver una lista
 *   vieja de inscritos a una práctica es peor que una consulta de más.
 * - **Ninguna mutación se reintenta.** Repetir un `POST` que quizá sí llegó es la forma de crear
 *   dos usuarios, dos cobros o dos inscripciones.
 *
 * Es una **función y no una instancia** para que cada montaje tenga la suya: una caché de módulo
 * sobrevive a todo, incluido un cambio de sesión.
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
