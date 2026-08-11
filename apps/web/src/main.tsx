import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
// Los tokens entran por `index.css`, que es quien los pasa por Tailwind. Importarlos aquí por
// separado los dejaría fuera de ese procesamiento y sin utilidades.
import "./index.css";
import { crearQueryClient } from "./lib/query-client.js";
import { routeTree } from "./routeTree.gen.js";

// La raíz de composición: aquí y en ningún otro lado se instancian los proveedores de la
// aplicación. Ver la nota de `routes/__root.tsx`.
const router = createRouter({ routeTree });
const queryClient = crearQueryClient();

// Le enseña a TanStack Router qué rutas existen, para que `<Link to="...">` con una ruta que no
// existe no compile. Es la mitad del valor de las rutas por archivo.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("No se encontró el elemento #root en index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
