import { expect, test, type Page } from "@playwright/test";
import { copy } from "../src/i18n/es-CO.js";

/**
 * T-741 · El recorrido de la grilla, en un navegador de verdad.
 *
 * El comisario abre la práctica que **ya se jugó y está sin cerrar**, corrige un chukker viendo
 * bajar la cuenta, la cierra, y comprueba que queda congelada. Después un jugador entra y ve sus
 * chukkers, que es la única pregunta que le hace a esta pantalla.
 *
 * **Parte de la práctica que siembra `db:seed`**, con el criterio de `051` T-640: llegar a este
 * estado por el camino normal exigiría esperar al proceso de decisión, y un test que espera a que
 * un reloj dispare es un test que a veces falla por el reloj.
 *
 * **Se deja reabierta al terminar.** Sin eso, la corrida siguiente encuentra la práctica cerrada y
 * el primer paso falla — que es exactamente lo que pasó en `030` T-34x con un motivo fijo y en
 * `051` T-641 con los equipos ya armados. Un E2E que sólo pasa la primera vez es un E2E que va a
 * fallar en CI.
 */
const COMISARIO = { email: "comisario@club-demo.test", password: "demo1234" };
const JUGADOR = { email: "jugador@club-demo.test", password: "demo1234" };

async function entrar(pagina: Page, quien: { email: string; password: string }): Promise<void> {
  await pagina.goto("/login");
  await pagina.getByLabel(copy.ingreso.correo).fill(quien.email);
  await pagina.getByLabel(copy.ingreso.contrasena).fill(quien.password);
  await pagina.getByRole("button", { name: copy.ingreso.entrar }).click();
  await expect(pagina.getByRole("heading", { level: 1 })).toContainText(copy.panel.saludo);
}

/** La práctica del seed que ya se jugó y no se ha cerrado: la que tiene grilla y sigue confirmada. */
async function abrirLaPracticaPorCerrar(pagina: Page): Promise<string> {
  const practicas = await pagina.evaluate(async () => {
    const respuesta = await fetch("/api/practices", { credentials: "include" });

    return (await respuesta.json()) as { id: string; status: string; startsAt: string }[];
  });

  const jugada = practicas
    .filter((practica) => practica.status === "confirmed")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  expect(jugada, "el seed no dejó una práctica jugada sin cerrar").toBeDefined();

  return jugada?.id ?? "";
}

test("corregir un chukker, cerrar la práctica, y ver la cuenta", async ({ page }) => {
  await entrar(page, COMISARIO);
  const practiceId = await abrirLaPracticaPorCerrar(page);

  await test.step("la grilla nace llena: todos juegan todo", async () => {
    await page.goto(`/practices/${practiceId}/grid`);

    // Si una corrida anterior la dejó cerrada, se reabre para empezar del mismo estado.
    const reabrir = page.getByRole("button", { name: copy.grilla.reabrir });
    const cerrar = page.getByRole("button", { name: copy.grilla.cerrar });

    // Se espera a que aparezca **alguno de los dos** antes de decidir: `isVisible()` no espera, y
    // con la pantalla cargando los dos dan `false` (la lección de `051` T-641).
    await expect(reabrir.or(cerrar)).toBeVisible();

    if (await reabrir.isVisible()) {
      await reabrir.click();
      await expect(cerrar).toBeVisible();
    }

    await expect(page.getByText("Ana Ejemplo", { exact: true })).toBeVisible();
    await expect(page.getByText(copy.grilla.cuenta(6)).first()).toBeVisible();
  });

  await test.step("un toque quita a alguien de un chukker y la cuenta baja", async () => {
    await page.getByRole("button", { name: copy.grilla.jugoChukker("Ana Ejemplo", 4) }).click();

    await expect(
      page.getByRole("button", { name: copy.grilla.noJugoChukker("Ana Ejemplo", 4) }),
    ).toBeVisible();
    await expect(page.getByText(copy.grilla.cuenta(5)).first()).toBeVisible();
  });

  await test.step("cerrar la congela", async () => {
    await page.getByRole("button", { name: copy.grilla.cerrar }).click();

    await expect(page.getByText(copy.grilla.cerrada)).toBeVisible();
    await expect(
      page.getByRole("button", { name: copy.grilla.noJugoChukker("Ana Ejemplo", 4) }),
    ).toBeDisabled();
  });

  await test.step("el jugador ve su cuenta, que es lo único que le pregunta a esta pantalla", async () => {
    await page.context().clearCookies();
    await entrar(page, JUGADOR);
    await page.goto(`/practices/${practiceId}`);

    await expect(page.getByRole("heading", { name: copy.grilla.misChukkers })).toBeVisible();
  });

  await test.step("y se deja reabierta, para que la corrida siguiente empiece igual", async () => {
    await page.context().clearCookies();
    await entrar(page, COMISARIO);
    await page.goto(`/practices/${practiceId}/grid`);

    await page.getByRole("button", { name: copy.grilla.reabrir }).click();
    await expect(page.getByRole("button", { name: copy.grilla.cerrar })).toBeVisible();

    // Y la corrección se devuelve: la grilla vuelve a estar llena.
    await page.getByRole("button", { name: copy.grilla.noJugoChukker("Ana Ejemplo", 4) }).click();
    await expect(page.getByText(copy.grilla.cuenta(6)).first()).toBeVisible();
  });
});
