import { expect, test, type Page } from "@playwright/test";
import { copy } from "../src/i18n/es-CO.js";

/**
 * T-350 · El recorrido del handicap, en un navegador de verdad.
 *
 * El comisario sube a un jugador, el valor nuevo se ve en el perfil, el cambio aparece en el
 * historial con su motivo, y **un administrador no ve el botón de editar** — que es la regla
 * central del módulo (R-030-02) comprobada donde el usuario la vive — en el segundo test.
 *
 * **El valor se restaura al terminar, pero el historial no se puede limpiar** — y ése es el punto
 * del módulo: es append-only. Por eso cada corrida usa un motivo único; con un texto fijo, la
 * segunda corrida encontraría dos entradas iguales y la aserción se rompería. Pasó, y el arreglo no
 * es aflojar la aserción: es reconocer que el historial crece y nombrar cada cambio.
 */
/**
 * Las dos cuentas del seed, y son dos a propósito.
 *
 * La primera versión de este test entraba como administrador y **le asignaba el rol de comisario a
 * mano en la base local**. Pasaba en local y falló en CI, que siembra desde cero — que es
 * exactamente para lo que sirve CI. El seed ya trae un comisario propio; usarlo hace que el test
 * pruebe la separación de autoridad en vez de esconderla.
 */
const COMISARIO = { email: "comisario@club-demo.test", password: "demo1234" };
const ADMINISTRADOR = { email: "admin@club-demo.test", password: "demo1234" };

async function entrar(pagina: Page, quien: { email: string; password: string }): Promise<void> {
  await pagina.goto("/login");
  await pagina.getByLabel(copy.ingreso.correo).fill(quien.email);
  await pagina.getByLabel(copy.ingreso.contrasena).fill(quien.password);
  await pagina.getByRole("button", { name: copy.ingreso.entrar }).click();
  await expect(pagina.getByRole("heading", { level: 1 })).toContainText(copy.panel.saludo);
}

/**
 * Abre a la primera persona desde el listado de handicaps del club.
 *
 * **Se entra por `/handicaps` y no por `/users`**, y eso es lo que este test destapó: `/users` exige
 * `user.edit`, que el comisario no tiene ni debe tener. Entrando por ahí, el único rol que puede
 * fijar un handicap no llegaba nunca a la pantalla donde se fija.
 */
async function abrirUnaPersona(pagina: Page): Promise<void> {
  await pagina.goto("/handicaps");
  await pagina.getByRole("button", { expanded: false }).first().click();
  await expect(pagina.getByRole("heading", { name: copy.handicaps.titulo, exact: true })).toBeVisible();
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

  await entrar(page, COMISARIO);
  await abrirUnaPersona(page);
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

test("el administrador del club ve el handicap pero no puede fijarlo", async ({ page }) => {
  // La otra mitad de R-030-02, donde el usuario la vive: el administrador puede todo en el club y
  // **esto no**. Un botón que existe para responder un 403 es una promesa incumplida.
  await entrar(page, ADMINISTRADOR);
  await abrirUnaPersona(page);

  await expect(page.getByRole("heading", { name: copy.handicaps.titulo, exact: true })).toBeVisible();
  await expect(page.getByRole("term").filter({ hasText: copy.handicaps.internacional })).toBeVisible();
  await expect(page.getByRole("button", { name: copy.handicaps.fijar })).toHaveCount(0);

  // Pero sí ve el historial: leerlo le corresponde, editarlo no.
  await page.getByRole("button", { name: copy.handicaps.verHistorial }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
