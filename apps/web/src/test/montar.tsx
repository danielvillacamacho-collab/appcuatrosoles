import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { routeTree } from "../routeTree.gen.js";

/**
 * Monta la aplicación de verdad en una ruta, con su router y su caché (T-124).
 *
 * **Monta el árbol de rutas completo, no el componente suelto.** Un test que renderiza
 `<Ingreso />` a mano pasa aunque la ruta esté mal declarada o el guard no la deje entrar, que son
 * dos de las tres formas en que esto se rompe de verdad.
 *
 * Cada test trae su propio `QueryClient` **sin reintentos**: con los reintentos por defecto, un
 * test de «qué pasa cuando el API falla» tarda segundos y a veces pasa por casualidad.
 */
export function montar(ruta: string): {
  ubicacion: () => string;
  /**
   * El `QueryClient` de este test.
   *
   * Sirve para provocar a mano lo que en producción pasa solo: **un refresco en segundo plano**.
   * Sin poder dispararlo, un test que dice comprobar «el refresco no se lleva los cambios» pasa
   * igual con y sin el arreglo, que es lo mismo que no tenerlo.
   */
  queryClient: QueryClient;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [ruta] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  );

  // El historial es de memoria, así que `window.location` no refleja nada: quien quiera comprobar
  // que algo viaja en la URL —los filtros del listado, por ejemplo— tiene que preguntárselo al
  // router.
  return { ubicacion: () => router.state.location.searchStr, queryClient };
}

/**
 * Un `fetch` de mentira que responde según la ruta pedida.
 *
 * Se simula en el borde —`fetch`— y no el módulo `api-client`: así el test pasa por el cliente
 * real, con su cabecera de CSRF y su traducción de errores. Simular el cliente dejaría sin probar
 * justo la capa que hace que las pantallas funcionen igual en todas partes.
 */
export type RespuestaSimulada = { estado: number; cuerpo?: unknown };

export function fetchSimulado(
  rutas: Record<string, RespuestaSimulada | (() => RespuestaSimulada)>,
): (url: string, init?: RequestInit) => Promise<Response> {
  return (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    const clave = `${metodo} ${url}`;
    const definida = rutas[clave] ?? rutas[url];

    if (definida === undefined) {
      // Un 404 silencioso escondería que la pantalla llamó a un endpoint que el test no previó,
      // y el síntoma sería un test verde sobre una pantalla vacía.
      throw new Error(`El test no definió respuesta para «${clave}»`);
    }

    const { estado, cuerpo } = typeof definida === "function" ? definida() : definida;

    return Promise.resolve(
      estado === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(cuerpo ?? {}), {
            status: estado,
            headers: { "content-type": "application/json" },
          }),
    );
  };
}
