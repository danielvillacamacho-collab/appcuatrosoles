import { expect, test, type Page } from "@playwright/test";
import { copy } from "../src/i18n/es-CO.js";

/**
 * T-640 · El recorrido de los equipos, en un navegador de verdad.
 *
 * El comisario abre la práctica confirmada del club de ejemplo, arma los equipos, mueve a alguien
 * **viendo cambiar la diferencia**, y aprueba. Después un administrador entra y ve los equipos
 * publicados.
 *
 * **Parte de la práctica que siembra `db:seed`**, y no de una que el test cree: llegar a una
 * práctica confirmada por el camino normal exige esperar a que corra el proceso de decisión, y un
 * test que espera a que un reloj dispare es un test que a veces falla por el reloj.
 *
 * Deja los equipos armados al terminar. No hace falta limpiarlos: rearmarlos es idempotente, así
 * que la corrida siguiente empieza igual apretando «volver a la propuesta del sistema».
 */
const COMISARIO = { email: "comisario@club-demo.test", password: "demo1234" };
const ADMIN = { email: "admin@club-demo.test", password: "demo1234" };

async function entrar(pagina: Page, quien: { email: string; password: string }): Promise<void> {
  await pagina.goto("/login");
  await pagina.getByLabel(copy.ingreso.correo).fill(quien.email);
  await pagina.getByLabel(copy.ingreso.contrasena).fill(quien.password);
  await pagina.getByRole("button", { name: copy.ingreso.entrar }).click();
  await expect(pagina.getByRole("heading", { level: 1 })).toContainText(copy.panel.saludo);
}

/** La práctica confirmada del seed: la que tiene a la gente «Ejemplo». */
async function abrirLaPracticaDelSeed(pagina: Page): Promise<string> {
  const practicas = await pagina.evaluate(async () => {
    const respuesta = await fetch("/api/practices", { credentials: "include" });

    return (await respuesta.json()) as { id: string; status: string }[];
  });

  const confirmada = practicas.find((practica) => practica.status === "confirmed");

  expect(confirmada, "el seed no dejó una práctica confirmada").toBeDefined();

  return confirmada?.id ?? "";
}

test("armar equipos, mover viendo la diferencia, y aprobar", async ({ page }) => {
  await entrar(page, COMISARIO);
  const practiceId = await abrirLaPracticaDelSeed(page);

  await test.step("el comisario arma los equipos", async () => {
    await page.goto(`/practices/${practiceId}/teams`);

    // Si ya estaban armados de una corrida anterior, se vuelve a la propuesta del sistema.
    const armar = page.getByRole("button", { name: copy.equipos.armar });
    const rearmar = page.getByRole("button", { name: copy.equipos.rearmar });

    if (await armar.isVisible().catch(() => false)) {
      await armar.click();
    } else {
      await rearmar.click();
    }

    await expect(page.getByRole("region", { name: copy.equipos.equipo("A") })).toBeVisible();

    // **Se espera a que el refresco aterrice antes de tocar nada.**
    //
    // Rearmar borra los equipos y los crea de nuevo, así que los puestos tienen identificadores
    // nuevos: el refresco que dispara la invalidación trae datos **genuinamente distintos** y la
    // pantalla los adopta, como debe. Si el test mueve a alguien en ese hueco, la adopción se lleva
    // el movimiento y el test falla — pasaba una de cada tres corridas.
    //
    // Perseguí esto un rato creyendo que el problema era que un refresco con datos iguales pisaba
    // los cambios. No lo era: con datos iguales, TanStack Query devuelve la misma referencia y no
    // pasa nada. Era esto, y es del test.
    await page.waitForLoadState("networkidle");
  });

  await test.step("el reparto queda parejo: es la promesa del módulo", async () => {
    // Los handicaps del seed están elegidos para que exista un reparto perfecto.
    await expect(page.getByText(copy.equipos.parejos, { exact: true })).toBeVisible();
  });

  await test.step("mover a alguien cambia la diferencia al instante", async () => {
    await page.getByRole("button", { name: /^Mover a/u }).first().click();

    await expect(page.getByText(copy.equipos.parejos, { exact: true })).toBeHidden();
    await expect(page.getByText(copy.equipos.cambiosSinGuardar)).toBeVisible();
  });

  await test.step("y volver a la propuesta del sistema los deja parejos otra vez", async () => {
    await page.getByRole("button", { name: copy.equipos.rearmar }).click();

    await expect(page.getByText(copy.equipos.parejos, { exact: true })).toBeVisible();
    await expect(page.getByText(copy.equipos.cambiosSinGuardar)).toBeHidden();
  });

  await test.step("aprobar los publica", async () => {
    await page.getByRole("button", { name: copy.equipos.aprobar }).click();

    await expect(page.getByText(copy.equipos.aprobados)).toBeVisible();
  });

  await test.step("y otra persona los ve en el detalle de la práctica", async () => {
    await page.context().clearCookies();
    await entrar(page, ADMIN);
    await page.goto(`/practices/${practiceId}`);

    await expect(page.getByRole("heading", { name: copy.equipos.titulo })).toBeVisible();
    await expect(page.getByText(copy.equipos.equipo("A"))).toBeVisible();
    await expect(page.getByText(copy.equipos.equipo("B"))).toBeVisible();
  });
});
