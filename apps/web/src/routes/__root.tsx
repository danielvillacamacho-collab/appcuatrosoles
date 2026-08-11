import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Alert } from "@polo/ui";
import { mensajeDeError } from "../lib/error-message.js";
import { PantallaDeEntrada } from "../components/Pantalla.js";
import { copy } from "../i18n/es-CO.js";

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
export const Route = createRootRoute({ component: Outlet, errorComponent: AlgoSeRompio });

/**
 * Lo que se ve cuando una pantalla lanza un error que nadie atrapó.
 *
 * Sin esto, la aplicación entera queda **en blanco**: React desmonta el árbol y no queda ni un
 * texto que explique qué pasó ni un enlace para salir. Pasó al abrir el listado de usuarios contra
 * un API desactualizado —la respuesta traía otra forma— y lo único visible era una página negra.
 *
 * No pretende diagnosticar: dice que algo se rompió, ofrece recargar, y deja el detalle en la
 * consola para quien esté programando.
 */
function AlgoSeRompio({ error }: { error: Error }): React.JSX.Element {
  return (
    <PantallaDeEntrada>
        <Alert>{mensajeDeError(error)}</Alert>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex min-h-tap w-full items-center justify-center rounded-lg border border-brunswick px-5 font-semibold text-brunswick"
        >
          {copy.comun.recargar}
        </button>
    </PantallaDeEntrada>
  );
}
