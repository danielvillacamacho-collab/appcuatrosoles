import { expect, test, type Page } from "@playwright/test";
import { copy } from "../src/i18n/es-CO.js";

/**
 * T-350 · El recorrido del handicap, en un navegador de verdad.
 *
 * El comisario sube a un jugador, el valor nuevo se ve en el perfil, el cambio aparece en el
 * historial con su motivo, y **un administrador no ve el botón de editar** — que es la regla
 * central del módulo (R-030-02) comprobada donde el usuario la vive.
 *
 * **El valor se restaura al terminar, pero el historial no se puede limpiar** — y ése es el punto
 * del módulo: es append-only. Por eso cada corrida usa un motivo único; con un texto fijo, la
 * segunda corrida encontraría dos entradas iguales y la aserción se rompería. Pasó, y el arreglo no
 * es aflojar la aserción: es reconocer que el historial crece y nombrar cada cambio.
 */
const ADMIN = { email: "admin@club-demo.test", password: "demo1234" };

async function entrar(pagina: Page): Promise<void> {
  await pagina.goto("/login");
  await pagina.getByLabel(copy.ingreso.correo).fill(ADMIN.email);
  await pagina.getByLabel(copy.ingreso.contrasena).fill(ADMIN.password);
  await pagina.getByRole("button", { name: copy.ingreso.entrar }).click();
  await expect(pagina.getByRole("heading", { level: 1 })).toContainText(copy.panel.saludo);
}

/**
 * Abre la ficha del primer usuario del listado.
 *
 * Se localiza por el `href` y no por el texto del enlace: el listado tiene dos formas —tarjetas en
 * el celular, tabla en el monitor— y el texto visible cambia entre ellas.
 *
 * Se excluye `/users/new`, que es el botón de crear y también empieza por `/users/`. Y se pide el
 * **visible**: el listado pinta las dos formas a la vez y esconde una con CSS, así que sin esto
 * `.first()` elige la que no se ve y el clic se queda esperando para siempre.
 */
async function abrirUnJugador(pagina: Page): Promise<void> {
  await pagina.goto("/users");
  await pagina.locator('a[href^="/users/"]:not([href="/users/new"]):visible').first().click();
  await expect(pagina.getByRole("heading", { name: copy.handicaps.titulo })).toBeVisible();
}

async function fijar(pagina: Page, goles: string, motivo: string): Promise<void> {
  await pagina.getByRole("button", { name: copy.handicaps.fijar }).nth(1).click();
  await pagina.getByLabel(copy.handicaps.nuevoValor).fill(goles);
  await pagina.getByLabel(copy.handicaps.motivo).fill(motivo);
  await pagina.getByRole("button", { name: copy.handicaps.guardar }).click();
}

/**
 * Deja el handicap en un valor conocido, venga de donde venga.
 *
 * Sin esto el test dependía del estado que dejó la corrida anterior: una corrida que fallara a
 * mitad dejaba al jugador en 3, y la siguiente empezaba pidiendo 3 otra vez y se topaba con «ya
 * tiene ese handicap». Un test que sólo pasa si el anterior terminó bien no es un test.
 */
async function asegurarEn(pagina: Page, goles: string): Promise<void> {
  await fijar(pagina, goles, "punto de partida");

  const campo = pagina.getByLabel(copy.handicaps.nuevoValor);

  // Si el formulario se cerró, el cambio entró. Si sigue abierto, es porque ya estaba en ese valor
  // —que es justo lo que queríamos— y se cierra a mano.
  await campo.waitFor({ state: "hidden", timeout: 3000 }).catch(async () => {
    await pagina.getByRole("button", { name: copy.comun.cancelar }).click();
  });
}

test("el comisario sube un handicap y queda en el historial", async ({ page }) => {
  // Único por corrida: el historial es append-only y las entradas de corridas anteriores siguen ahí.
  const marca = `E2E-${Date.now()}`;

  await entrar(page);
  await abrirUnJugador(page);
  await asegurarEn(page, "-2");

  await test.step("sube a 3 goles con su motivo", async () => {
    await fijar(page, "3", `${marca}: sube`);

    await expect(page.getByText("3", { exact: true }).first()).toBeVisible();
  });

  await test.step("el cambio aparece en el historial, con motivo y autor", async () => {
    await page.getByRole("button", { name: copy.handicaps.verHistorial }).click();

    await expect(page.getByText(`${marca}: sube`)).toBeVisible();
    await expect(page.getByText(/por /u).first()).toBeVisible();
  });

  await test.step("fijar el mismo valor se rechaza con el texto del club", async () => {
    await fijar(page, "3", `${marca}: igual`);

    await expect(
      page.getByRole("alert").filter({ hasText: copy.errores.handicap_sin_cambio }),
    ).toBeVisible();
    await page.getByRole("button", { name: copy.comun.cancelar }).click();
  });

  await test.step("«2,3» no es un handicap y la pantalla no lo redondea", async () => {
    await fijar(page, "2,3", `${marca}: decimal`);

    await expect(page.getByText(copy.handicaps.valorInvalido)).toBeVisible();
    await page.getByRole("button", { name: copy.comun.cancelar }).click();
  });

  await test.step("se deja como estaba: vuelve a −2", async () => {
    await fijar(page, "-2", `${marca}: se restaura`);

    await expect(page.getByText("−2").first()).toBeVisible();
  });
});
