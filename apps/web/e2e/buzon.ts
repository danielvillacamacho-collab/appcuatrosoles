import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect } from "@playwright/test";

/**
 * El buzón de desarrollo: los `.html` que escribe `MailerDeArchivo` (T-026).
 *
 * **El E2E lee el correo del disco, no la tabla `outbox_message`.** Es lo que hace que estos tests
 * digan algo del producto: si el enlace sale mal armado —sin el subdominio del club, con el token
 * en el sitio equivocado, apuntando a una ruta que no existe— aquí se cae. Leyendo la base, no.
 *
 * Ya pasó una vez: los enlaces apuntaban a `/aceptar-invitacion` cuando la ruta de la aplicación es
 * `/accept-invitation`, y ningún test lo notó porque ninguno abría el enlace.
 */
/**
 * Donde `MailerDeArchivo` escribe por defecto: `./.correos` **relativo al proceso del API**, que
 * corre en `apps/api`.
 *
 * A propósito no se fuerza `MAIL_DIR` desde la configuración de Playwright: en desarrollo el
 * servidor se reusa si ya está levantado (`reuseExistingServer`), y ese que ya estaba no habría
 * recibido la variable. El test leería una carpeta vacía y culparía al producto de un problema del
 * arnés.
 */
const CARPETA = resolve(import.meta.dirname, "../../api/.correos");

/**
 * El enlace del último correo que llegó a esa dirección **apuntando a la ruta esperada**.
 *
 * La ruta no es un lujo: una misma persona recibe varios correos —invitación, restablecimiento,
 * confirmación de cambio de correo— y «el último» no sirve para distinguirlos. Sin ella, pedir el
 * enlace de restablecimiento devolvía el de la invitación, que ya estaba ahí, y el test navegaba a
 * la pantalla equivocada sin que nada dijera por qué.
 *
 * Y espera a que llegue: el correo se encola en la misma transacción que la mutación (P-11), pero
 * lo envía el programador de la bandeja unos segundos después. Sin la espera, el test sería una
 * carrera perdida contra un temporizador.
 */
export async function enlaceDelUltimoCorreoA(email: string, ruta: string): Promise<string> {
  let enlace = "";

  await expect
    .poll(
      async () => {
        enlace = (await enlaceEnElBuzon(email, ruta)) ?? "";

        return enlace;
      },
      {
        message: `no llegó ningún correo a ${email} con un enlace a ${ruta}`,
        timeout: 30_000,
        intervals: [500, 1000, 2000],
      },
    )
    .not.toBe("");

  return enlace;
}

async function enlaceEnElBuzon(email: string, ruta: string): Promise<string | undefined> {
  const archivos = (await readdir(CARPETA).catch(() => []))
    .filter((nombre) => nombre.includes(email))
    // El nombre lleva la marca de tiempo delante, así que ordenar por texto ordena por fecha, y se
    // recorre del más nuevo al más viejo.
    .sort()
    .reverse();

  for (const nombre of archivos) {
    const html = await readFile(join(CARPETA, nombre), "utf8");
    const enlace = /href="([^"]*token=[^"]+)"/u.exec(html)?.[1];

    if (enlace !== undefined && enlace.includes(ruta)) {
      return enlace;
    }
  }

  return undefined;
}

/** Un correo distinto en cada corrida: la base de desarrollo no se limpia entre ejecuciones. */
export function correoDePrueba(prefijo: string): string {
  const marca = Math.random().toString(36).slice(2, 10);

  return `${prefijo}-${marca}@ejemplo.test`;
}
