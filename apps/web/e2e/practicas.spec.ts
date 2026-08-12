import { expect, test, type Page } from "@playwright/test";
import { copy } from "../src/i18n/es-CO.js";

/**
 * T-560 · El recorrido de una práctica, en un navegador de verdad.
 *
 * El administrador crea y publica; dos personas se postulan; el segundo queda en la lista de espera
 * porque hay un solo cupo; el primero se retira, y **el segundo pasa a estar dentro sin que corra
 * nada**. Ese último paso es la propiedad central del módulo (`plan.md` §0.1) vista donde el
 * usuario la vive.
 *
 * Cada corrida usa una fecha propia: las prácticas ocupan cancha, y dos corridas con la misma
 * franja chocarían. Es la lección del E2E de `specs/030`, donde un motivo fijo hacía que la segunda
 * corrida encontrara dos entradas iguales.
 */
/** `copy.practicas.estados` es un mapa, y el índice puede venir vacío según el tipo. */
function estado(nombre: "draft" | "published" | "cancelled"): string {
  return copy.practicas.estados[nombre] ?? nombre;
}

const ADMIN = { email: "admin@club-demo.test", password: "demo1234" };
const JUGADOR = { email: "jugador@club-demo.test", password: "demo1234" };

async function entrar(pagina: Page, quien: { email: string; password: string }): Promise<void> {
  await pagina.goto("/login");
  await pagina.getByLabel(copy.ingreso.correo).fill(quien.email);
  await pagina.getByLabel(copy.ingreso.contrasena).fill(quien.password);
  await pagina.getByRole("button", { name: copy.ingreso.entrar }).click();
  await expect(pagina.getByRole("heading", { level: 1 })).toContainText(copy.panel.saludo);
}

async function salir(pagina: Page): Promise<void> {
  await pagina.context().clearCookies();
}

test("publicar, postularse, y que el de la espera entre al retirarse el primero", async ({
  page,
}) => {
  // **Un día propio de esta corrida.** La cancha no admite dos cosas a la misma hora, y con un
  // rango chico de horas dos corridas chocaban: la segunda no podía publicar y el síntoma aparecía
  // dos pasos después, como un botón que no estaba. Se vio una vez cada tres corridas.
  //
  // El día se elige entre 500 posibles a partir del reloj, así que dos corridas del mismo día son
  // improbables aunque alguna quede a medias sin liberar la cancha.
  const dia = new Date(Date.now() + (400 + (Date.now() % 500)) * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  // Dentro del horario de operación del club, con una hora libre después para el fin.
  const desde = 10;
  const hora = `${String(desde).padStart(2, "0")}:00`;
  const horaFin = `${String(desde + 1).padStart(2, "0")}:00`;
  // El cierre y la decisión van **antes** de que empiece: decidir si una práctica se hace cuando ya
  // empezó no significa nada, y el API lo rechaza. Los valores por defecto del formulario son de
  // media tarde, así que con una práctica temprano hay que moverlos.
  const horaCierre = `${String(desde - 2).padStart(2, "0")}:00`;
  const horaDecision = `${String(desde - 1).padStart(2, "0")}:00`;
  let url = "";

  await test.step("el administrador crea la práctica con un solo cupo", async () => {
    await entrar(page, ADMIN);
    await page.goto("/practices/new");

    await page.getByLabel(copy.nuevaPractica.fecha).fill(dia);
    await page.getByLabel(copy.nuevaPractica.desde).fill(hora);
    await page.getByLabel(copy.nuevaPractica.hasta).fill(horaFin);
    await page.getByLabel(copy.nuevaPractica.objetivo).fill("1");
    await page.getByLabel(copy.nuevaPractica.minimo).fill("1");
    await page.getByLabel(copy.practicas.cierra).fill(horaCierre);
    await page.getByLabel(copy.practicas.decide).fill(horaDecision);
    await page.getByRole("button", { name: copy.nuevaPractica.crear }).click();

    await expect(page.getByText(estado("draft"))).toBeVisible();

    // **Se espera a la URL, no se lee al vuelo.** La navegación la hace el router con `pushState`,
    // y `page.url()` devolvía todavía `/practices/new` aunque la pantalla ya fuera la del detalle:
    // el test se llevaba esa ruta y volvía al formulario tres pasos después, con un síntoma que no
    // se parecía en nada a la causa.
    await page.waitForURL(/\/practices\/[0-9a-f]{8}-/u);
    url = page.url();
  });

  await test.step("publicarla reserva la cancha", async () => {
    await page.getByRole("button", { name: copy.nuevaPractica.publicar }).click();

    await expect(page.getByText(estado("published"))).toBeVisible();
  });

  await test.step("el administrador se postula y queda dentro", async () => {
    await page.getByRole("button", { name: copy.practicas.postularme }).click();

    await expect(page.getByText(copy.practicas.estoyDentro).first()).toBeVisible();
  });

  await test.step("el jugador se postula y queda EN LA LISTA DE ESPERA", async () => {
    await salir(page);
    await entrar(page, JUGADOR);
    await page.goto(url);

    await page.getByRole("button", { name: copy.practicas.postularme }).click();

    await expect(page.getByText(copy.practicas.estoyEnEspera(1)).first()).toBeVisible();
  });

  await test.step("el primero se retira y el de la espera entra SIN que corra nada", async () => {
    await salir(page);
    await entrar(page, ADMIN);
    await page.goto(url);
    await page.getByRole("button", { name: copy.practicas.retirarme }).click();
    await expect(page.getByRole("button", { name: copy.practicas.postularme })).toBeVisible();

    await salir(page);
    await entrar(page, JUGADOR);
    await page.goto(url);

    // Nadie promovió a nadie: el reparto se calcula al leer.
    await expect(page.getByText(copy.practicas.estoyDentro).first()).toBeVisible();
  });

  await test.step("y el administrador cancela, que libera la cancha", async () => {
    await salir(page);
    await entrar(page, ADMIN);
    await page.goto(url);

    await page.getByLabel(copy.nuevaPractica.motivoCancelacion).fill("E2E: se cancela");
    await page.getByRole("button", { name: copy.nuevaPractica.cancelar }).click();

    await expect(page.getByText(estado("cancelled")).first()).toBeVisible();
  });
});
