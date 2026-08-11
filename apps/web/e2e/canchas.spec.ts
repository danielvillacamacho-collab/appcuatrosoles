import { expect, test, type Page } from "@playwright/test";
import { copy } from "../src/i18n/es-CO.js";

/**
 * T-470 · El recorrido del bloqueo, en un navegador de verdad.
 *
 * La administradora bloquea una franja por riego, el calendario lo muestra, intentar programar
 * encima falla con un mensaje entendible, y al levantar el bloqueo la franja vuelve. Es el ciclo
 * completo de HU-040-03 pasando por las pantallas, no por el API.
 *
 * Usa un día fijo lejano para no chocar con datos que otras corridas dejaron: la base de
 * desarrollo no se limpia entre ejecuciones.
 */
const ADMIN = { email: "admin@club-demo.test", password: "demo1234" };
const EL_DIA = "2027-03-10";

async function entrar(pagina: Page): Promise<void> {
  await pagina.goto("/login");
  await pagina.getByLabel(copy.ingreso.correo).fill(ADMIN.email);
  await pagina.getByLabel(copy.ingreso.contrasena).fill(ADMIN.password);
  await pagina.getByRole("button", { name: copy.ingreso.entrar }).click();
  await expect(pagina.getByRole("heading", { level: 1 })).toContainText(copy.panel.saludo);
}

async function bloquear(
  pagina: Page,
  desde: string,
  hasta: string,
  motivo: string,
): Promise<void> {
  await pagina.getByRole("button", { name: copy.calendario.bloquear }).click();
  await pagina.getByLabel(copy.bloquearFranja.desde).fill(desde);
  await pagina.getByLabel(copy.bloquearFranja.hasta).fill(hasta);
  await pagina.getByLabel(copy.bloquearFranja.motivo).fill(motivo);
  await pagina.getByRole("button", { name: copy.bloquearFranja.bloquear, exact: true }).click();
}

test("bloquear por riego, chocar contra el bloqueo, y levantarlo", async ({ page }) => {
  await entrar(page);

  await test.step("el calendario del día está libre", async () => {
    await page.goto(`/calendar?date=${EL_DIA}`);
    await expect(page.getByRole("heading", { name: "Cancha 1" })).toBeVisible();
  });

  await test.step("la administradora bloquea de 10:00 a 11:30 por riego", async () => {
    await bloquear(page, "10:00", "11:30", "Riego E2E");

    // El calendario lo muestra con su motivo — es lo que lee la siguiente persona.
    await expect(page.getByText("Riego E2E")).toBeVisible();
    await expect(page.getByText(/10:00.*11:30/u)).toBeVisible();
  });

  await test.step("bloquear encima falla con un mensaje entendible", async () => {
    await bloquear(page, "10:30", "12:00", "Encima E2E");

    await expect(page.getByRole("alert").filter({ hasText: copy.errores.cancha_ocupada })).toBeVisible();
    await page.getByRole("button", { name: copy.comun.cancelar }).click();
  });

  await test.step("al levantar el bloqueo la franja vuelve a estar libre", async () => {
    await page.getByRole("button", { name: copy.calendario.levantarBloqueo }).click();

    await expect(page.getByText("Riego E2E")).not.toBeVisible();
    // Y ahora el que antes chocaba, entra.
    await bloquear(page, "10:30", "12:00", "Ahora sí E2E");
    await expect(page.getByText("Ahora sí E2E")).toBeVisible();

    // Se deja el día limpio para la próxima corrida.
    await page.getByRole("button", { name: copy.calendario.levantarBloqueo }).click();
    await expect(page.getByText("Ahora sí E2E")).not.toBeVisible();
  });
});
