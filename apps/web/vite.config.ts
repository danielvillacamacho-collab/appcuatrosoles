import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ADR-003 — SPA estática, sin SSR. ADR-014 punto 9: presupuesto de 200 KB comprimidos.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
