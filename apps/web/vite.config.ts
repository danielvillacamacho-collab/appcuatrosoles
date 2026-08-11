import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ADR-003 — SPA estática, sin SSR. ADR-014 punto 9: presupuesto de 200 KB comprimidos.
export default defineConfig({
  plugins: [
    // Rutas por archivo (`docs/04` §3). Genera `routeTree.gen.ts`, que **se versiona**: sin él,
    // `tsc` no compila en CI, y generarlo en el pipeline sería un paso más que puede fallar
    // distinto de como falla en la máquina de quien programa.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    // Sin este plugin, `@import "tailwindcss"` produce CSS pero **ninguna utilidad**: las clases
    // no existen y los componentes salen sin estilo, sin que nada falle.
    tailwindcss(),
  ],
  server: {
    // Escucha en toda la red local, no sólo en `localhost`: es lo que permite abrir el producto
    // desde un celular con `pnpm dev:celular` (`docs/10` §3). La prueba que más importa es
    // «ábrelo en tu teléfono», y sin esto no se podía hacer.
    host: true,
    // Vite bloquea por defecto los hosts que no conoce, y aquí llegan por subdominio del club:
    // `club-demo.192-168-1-50.nip.io`. Se permiten esos dos sufijos y ninguno más — abrirlo del
    // todo dejaría el servidor de desarrollo contestando a cualquier nombre que apunte a esta IP.
    allowedHosts: [".localhost", ".nip.io"],
    // Una sola entrada, porque todo el API cuelga de `/api` (ver `configure-app.ts`). Antes había
    // una por recurso, y `/me` capturaba también la ruta `/me/profile` de esta aplicación: la
    // pantalla del perfil devolvía el JSON del API en vez de existir.
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: false } },
  },
  build: {
    outDir: "dist",
  },
});
