import { Outlet, createRootRoute } from "@tanstack/react-router";

/**
 * La raíz del árbol de rutas (T-121).
 *
 * **No monta proveedores.** Los proveedores de la aplicación —la caché de consultas— viven en
 * `main.tsx`, que es la raíz de composición. Tenerlos aquí los convertía en un singleton de módulo:
 * una sola caché para todo el proceso, compartida entre montajes. En el navegador eso pasa
 * inadvertido porque sólo hay una aplicación; en los tests hacía que la respuesta de un caso
 * quedara servida al siguiente, y la primera vez que se notó fue un panel que no se pintaba porque
 * el caso anterior había dejado «no hay sesión» en la caché.
 */
export const Route = createRootRoute({ component: Outlet });
