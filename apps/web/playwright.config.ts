import { defineConfig, devices } from "@playwright/test";

/**
 * E2E de navegador (T-128, `docs/05` §7).
 *
 * **Pocos y de los flujos que, si se rompen, paran la operación del club.** No cada combinación de
 * interfaz: eso lo cubren los tests de componente, que son mil veces más rápidos.
 *
 * Levanta el API y la aplicación web de verdad, contra la base de desarrollo, y entra por el
 * **subdominio del club sembrado** (`club-demo.localhost`). El subdominio no es un detalle: es como
 * el servidor resuelve el tenant (`ADR-013`), así que un E2E que entrara por `localhost` a secas
 * probaría un camino que no existe en producción.
 */
/**
 * El dominio base **sigue al del entorno**, no está fijo.
 *
 * Con `pnpm dev:celular` corriendo, los servidores levantados resuelven el club contra otro dominio
 * (`192-168-1-51.nip.io`), y como en desarrollo Playwright los reusa, un `baseURL` fijo entraba por
 * un subdominio que ese API no reconoce: la página cargaba y toda consulta respondía 404. El
 * síntoma no decía nada sobre la causa.
 */
const DOMINIO = process.env.BASE_DOMAIN ?? "localhost";
const SUBDOMINIO = `http://club-demo.${DOMINIO}:5173`;

export default defineConfig({
  testDir: "./e2e",
  // Uno a la vez: comparten la base de desarrollo y el buzón en disco. Paralelizar aquí cambiaría
  // fallos reales por fallos de carrera, que es el peor negocio posible en un E2E.
  workers: 1,
  fullyParallel: false,
  // Un E2E que se reintenta esconde justo lo que hay que ver: si es inestable, está mal escrito.
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI === undefined ? [["list"]] : [["github"], ["list"]],

  use: {
    baseURL: SUBDOMINIO,
    // Sólo del intento que falla: guardar todo llena el disco y nadie mira los que pasaron.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  /**
   * Los dos servidores reales.
   *
   * `reuseExistingServer` en desarrollo: quien ya tiene `pnpm dev` corriendo no espera un arranque
   * de veinte segundos por cada corrida. En CI siempre se levantan limpios.
   */
  webServer: [
    {
      command: "pnpm --filter @polo/api exec dotenv -e ../../.env -- nest start",
      url: "http://localhost:3000/api/health",
      cwd: "../..",
      reuseExistingServer: process.env.CI === undefined,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter @polo/web dev",
      url: SUBDOMINIO,
      cwd: "../..",
      reuseExistingServer: process.env.CI === undefined,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
