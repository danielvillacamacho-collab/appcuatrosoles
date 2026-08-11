import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Tests de la interfaz (`docs/05` §4).
 *
 * `jsdom` y no el entorno de Node: lo que se prueba aquí es lo que ve y hace una persona en un
 * navegador —qué texto aparece, qué pasa al escribir y presionar— y eso no existe sin un DOM.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.spec.{ts,tsx}"],
    // Los errores provocados a propósito no deben ensuciar la salida, igual que en el API.
    silent: false,
  },
});
