import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

/**
 * Levanta el producto en la red local para abrirlo **desde un celular de verdad** (`docs/10` §3
 * punto 4, T-111).
 *
 * El problema que resuelve: el club se resuelve por **subdominio** (`ADR-013`), y
 * `club-demo.localhost` sólo existe dentro de esta máquina. Desde un teléfono no resuelve, así que
 * la prueba que más importa —«ábrelo en tu teléfono»— era imposible sin tocar el archivo de hosts
 * del celular, que en iOS ni siquiera se puede.
 *
 * La salida es `nip.io`: un DNS público que devuelve la IP que lleva escrita en el nombre. Con la
 * máquina en `192.168.1.50`, `club-demo.192-168-1-50.nip.io` resuelve a `192.168.1.50` desde
 * cualquier dispositivo con internet, **sin instalar ni configurar nada en el teléfono**. No entra
 * en producción ni en CI: es una herramienta de desarrollo y no una dependencia del producto.
 */
const ip = ipDeLaRedLocal();

if (ip === undefined) {
  console.error("No encontré una dirección IPv4 en la red local. ¿Está la máquina conectada al wifi?");
  process.exit(1);
}

const baseDomain = `${ip.replaceAll(".", "-")}.nip.io`;
const url = `http://club-demo.${baseDomain}:5173`;

console.log(`
  Abre esto en el celular, conectado al MISMO wifi que este computador:

    ${url}

  Cuenta de ejemplo (pnpm db:seed):  admin@club-demo.test  /  demo1234
  Los correos se escriben en apps/api/.correos — ábrelos desde este computador.

  Si el teléfono no carga nada, casi siempre es el cortafuegos de macOS bloqueando
  las conexiones entrantes al proceso de Node.
`);

// `BASE_DOMAIN` va en el entorno y no en el `.env`: `dotenv-cli` no pisa lo que ya viene definido,
// así que esto gana sin que haya que editar —y después acordarse de revertir— un archivo.
const hijo = spawn("pnpm", ["dev"], {
  stdio: "inherit",
  env: { ...process.env, BASE_DOMAIN: baseDomain, WEB_PORT: "5173" },
});

hijo.on("exit", (codigo) => process.exit(codigo ?? 0));

/**
 * La IPv4 de la red local.
 *
 * Se descartan las internas (`127.0.0.1`) y las de enlace local (`169.254.x.x`, que aparecen
 * cuando una interfaz está levantada pero sin DHCP): ninguna de las dos sirve para que otro
 * dispositivo llegue hasta aquí.
 */
function ipDeLaRedLocal() {
  return Object.values(networkInterfaces())
    .flat()
    .find(
      (interfaz) =>
        interfaz !== undefined &&
        interfaz.family === "IPv4" &&
        !interfaz.internal &&
        !interfaz.address.startsWith("169.254."),
    )?.address;
}
