import { expect, test, type Page } from "@playwright/test";
import { correoDePrueba, enlaceDelUltimoCorreoA } from "./buzon.js";
import { copy } from "../src/i18n/es-CO.js";

/**
 * T-128 · El recorrido de T-100, en un navegador de verdad.
 *
 * **Es el pendiente que dejó anotado `verification.md` §K.** Los tests de API ya cubrían este
 * camino, pero contra `supertest`: probaban que el servidor responde lo correcto, no que una
 * persona pueda usarlo. Lo que sólo se ve aquí es el pegamento — que el enlace del correo lleve a
 * una pantalla que existe, que la cookie de sesión sobreviva a la navegación, que el formulario
 * mande lo que muestra.
 *
 * Depende del club de ejemplo (`pnpm db:seed`, `docs/05` §8): un E2E con fixtures propios termina
 * probando su propio andamiaje.
 */
const ADMIN = { email: "admin@club-demo.test", password: "demo1234" };

/**
 * Entra y **espera a estar dentro**.
 *
 * La espera es la parte que importa: navegar a otra pantalla justo después de presionar «Entrar»
 * cancela la petición en curso, la sesión no llega a abrirse y el guard devuelve al ingreso. El
 * síntoma es un test que se queda esperando un botón que no existe, sin nada que sugiera que el
 * problema fue la prisa.
 */
async function entrar(pagina: Page, email: string, contrasena: string): Promise<void> {
  await pagina.goto("/login");
  await pagina.getByLabel(copy.ingreso.correo).fill(email);
  await pagina.getByLabel(copy.ingreso.contrasena).fill(contrasena);
  await pagina.getByRole("button", { name: copy.ingreso.entrar }).click();

  await expect(pagina.getByRole("heading", { level: 1 })).toContainText(copy.panel.saludo);
}

test.describe("Del alta al panel propio", () => {
  test("el club invita, la persona define su contraseña, entra y ve lo suyo", async ({ page }) => {
    const correo = correoDePrueba("invitado");
    const contrasena = "mi-primera-clave-2026";

    await test.step("la administradora entra", async () => {
      await entrar(page, ADMIN.email, ADMIN.password);

      // El panel dice quién entró: es la prueba de que la sesión quedó abierta de verdad.
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Administradora");
    });

    await test.step("crea la cuenta con sólo el correo", async () => {
      await page.goto("/users/new");
      await page.getByLabel(copy.nuevoUsuario.correo).fill(correo);
      await page.getByRole("button", { name: copy.nuevoUsuario.crear }).click();

      // Cae en la ficha de la persona recién creada, invitada y sin contraseña. `exact` porque
      // el correo de prueba empieza por «invitado» y si no, el localizador se lo lleva también.
      await expect(page.getByText(copy.usuarios.estados["invited"] ?? "", { exact: true })).toBeVisible();
    });

    await test.step("le llega el correo y el enlace lleva a una pantalla que existe", async () => {
      const enlace = await enlaceDelUltimoCorreoA(correo, "/accept-invitation");

      // El enlace se abre **tal como llegó**, con su host y su ruta: es lo único que comprueba que
      // el API arma una dirección que la aplicación web sabe atender.
      await page.goto(enlace);

      await expect(page.getByLabel(copy.invitacion.contrasena)).toBeVisible();
    });

    await test.step("define su contraseña", async () => {
      await page.getByLabel(copy.invitacion.nombre).fill("Persona invitada");
      await page.getByLabel(copy.invitacion.contrasena, { exact: true }).fill(contrasena);
      await page.getByLabel(copy.invitacion.confirmacion).fill(contrasena);
      await page.getByRole("button", { name: copy.invitacion.guardar }).click();

      // El API activa la cuenta pero no abre sesión: quien acaba de elegir una contraseña la prueba
      // de una vez, en vez de descubrir mañana que escribió otra cosa.
      await expect(page.getByRole("button", { name: copy.ingreso.entrar })).toBeVisible();
    });

    await test.step("entra con lo que acaba de elegir y ve su panel", async () => {
      await page.getByLabel(copy.ingreso.correo).fill(correo);
      await page.getByLabel(copy.ingreso.contrasena).fill(contrasena);
      await page.getByRole("button", { name: copy.ingreso.entrar }).click();

      await expect(page.getByRole("heading", { level: 1 })).toContainText("Persona invitada");
      // El nombre que puso ella al aceptar, no el correo provisional con el que nació la ficha.
      await expect(page.getByText(correo)).toBeVisible();
    });
  });

  test("una contraseña incorrecta no dice si el correo existe", async ({ page }) => {
    // R-010-07 y P-12, comprobados donde el usuario los ve: si los dos mensajes fueran distintos,
    // esta pantalla sería un buscador de socios del club.
    await page.goto("/login");

    await page.getByLabel(copy.ingreso.correo).fill(ADMIN.email);
    await page.getByLabel(copy.ingreso.contrasena).fill("no-es-la-mia-1");
    await page.getByRole("button", { name: copy.ingreso.entrar }).click();
    const conCuenta = await page.getByRole("alert").textContent();

    await page.getByLabel(copy.ingreso.correo).fill("no-existe@club-demo.test");
    await page.getByLabel(copy.ingreso.contrasena).fill("no-es-la-mia-1");
    await page.getByRole("button", { name: copy.ingreso.entrar }).click();
    const sinCuenta = await page.getByRole("alert").textContent();

    expect(conCuenta).toBe(copy.errores.CREDENTIALS_INVALID);
    expect(sinCuenta).toBe(conCuenta);
  });
});

test.describe("Olvidar la contraseña cierra las demás sesiones (R-010-09)", () => {
  test("restablece desde el correo y la sesión anterior deja de servir", async ({ browser }) => {
    // Dos contextos son dos navegadores distintos: es la única forma de comprobar de verdad que la
    // sesión del **otro** dispositivo muere. Es el caso que justifica la regla — si la sesión
    // robada sobreviviera, restablecer no serviría contra el único ataque del que protege.
    const correo = correoDePrueba("olvido");
    const primera = "la-que-voy-a-olvidar-1";
    const nueva = "la-nueva-de-verdad-2";

    const admin = await browser.newContext();
    const paginaAdmin = await admin.newPage();
    await entrar(paginaAdmin, ADMIN.email, ADMIN.password);
    await paginaAdmin.goto("/users/new");
    await paginaAdmin.getByLabel(copy.nuevoUsuario.correo).fill(correo);
    await paginaAdmin.getByRole("button", { name: copy.nuevoUsuario.crear }).click();
    await expect(
      paginaAdmin.getByText(copy.usuarios.estados["invited"] ?? "", { exact: true }),
    ).toBeVisible();

    const invitacion = await enlaceDelUltimoCorreoA(correo, "/accept-invitation");
    await paginaAdmin.goto(invitacion);
    await paginaAdmin.getByLabel(copy.invitacion.contrasena, { exact: true }).fill(primera);
    await paginaAdmin.getByLabel(copy.invitacion.confirmacion).fill(primera);
    await paginaAdmin.getByRole("button", { name: copy.invitacion.guardar }).click();
    await expect(paginaAdmin.getByRole("button", { name: copy.ingreso.entrar })).toBeVisible();
    await admin.close();

    // El celular: la sesión que tiene que morir.
    const celular = await browser.newContext();
    const paginaCelular = await celular.newPage();
    await entrar(paginaCelular, correo, primera);

    // El computador: desde ahí se pide el restablecimiento.
    const computador = await browser.newContext();
    const paginaComputador = await computador.newPage();
    await paginaComputador.goto("/forgot-password");
    await paginaComputador.getByLabel(copy.olvide.correo).fill(correo);
    await paginaComputador.getByRole("button", { name: copy.olvide.enviar }).click();
    await expect(paginaComputador.getByText(copy.olvide.listo)).toBeVisible();

    const restablecer = await enlaceDelUltimoCorreoA(correo, "/reset-password");
    await paginaComputador.goto(restablecer);
    await paginaComputador.getByLabel(copy.restablecer.contrasena, { exact: true }).fill(nueva);
    await paginaComputador.getByLabel(copy.restablecer.confirmacion).fill(nueva);
    await paginaComputador.getByRole("button", { name: copy.restablecer.guardar }).click();
    await expect(paginaComputador.getByText(copy.restablecer.listo)).toBeVisible();

    // Y ahora lo que importa: el celular ya no está dentro.
    await paginaCelular.goto("/");
    await expect(paginaCelular.getByRole("button", { name: copy.ingreso.entrar })).toBeVisible();

    // Con la nueva sí entra: restablecer no puede dejar a nadie fuera de su propia cuenta.
    await entrar(paginaCelular, correo, nueva);

    await celular.close();
    await computador.close();
  });
});
