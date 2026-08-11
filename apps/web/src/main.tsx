import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
// Los tokens entran por `index.css`, que es quien los pasa por Tailwind. Importarlos aquí por
// separado los dejaría fuera de ese procesamiento y sin utilidades.
import "./index.css";
import { routeTree } from "./routeTree.gen.js";

const router = createRouter({ routeTree });

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
    <RouterProvider router={router} />
  </StrictMode>,
);
