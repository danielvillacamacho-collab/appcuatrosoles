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
    // El API vive en el mismo origen que la aplicación en producción (`plan.md` §9.3): la cookie
    // de sesión y la resolución de tenant por subdominio dependen de eso. En desarrollo lo imita
    // este proxy, para que no haya un `VITE_API_URL` que sólo exista aquí y esconda el problema.
    proxy: Object.fromEntries(
      ["/auth", "/me", "/users", "/minors", "/guardianships", "/waivers", "/club", "/organizations", "/seasons", "/membership-categories", "/settings", "/audit-log", "/platform", "/health"].map(
        (ruta) => [ruta, { target: "http://localhost:3000", changeOrigin: false }],
      ),
    ),
  },
  build: {
    outDir: "dist",
  },
});
