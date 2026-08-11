import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * El presupuesto de bundle como gate (T-137, `ADR-014` punto 9).
 *
 * **200 KB comprimidos para lo que el navegador tiene que descargar antes de ver la primera
 * pantalla.** No es un número estético: la mitad de quienes usan esto lo abren desde el celular al
 * borde de la cancha, con la señal que haya. Cada 100 KB de más son segundos de pantalla en blanco
 * en una red mala.
 *
 * Se mide **gzip** y no el tamaño en disco porque es lo que viaja por el cable, y se mide sólo la
 * **carga inicial** —el `index.html` más lo que él referencia directamente—: las pantallas que
 * llegan por importación dinámica no las paga quien sólo entra a ver su panel.
 *
 * Entró con la primera pantalla y no después, a propósito: un presupuesto que se agrega tarde ya
 * viene incumplido, y bajarlo para que pase el build está prohibido (regla de oro 12).
 */
const LIMITE_BYTES = 200 * 1024;

const dist = resolve(import.meta.dirname, "../dist");
const html = readFileSync(join(dist, "index.html"), "utf8");

/** Lo que el HTML referencia directamente: los `<script src>` y los `<link href>` de la carga inicial. */
const referencias = [...html.matchAll(/(?:src|href)="\/([^"]+\.(?:js|css))"/gu)].map(
  (coincidencia) => coincidencia[1],
);

if (referencias.length === 0) {
  // Si el HTML cambia de forma y este script deja de encontrar nada, el gate pasaría siempre. Un
  // gate que no puede fallar es peor que no tenerlo: no avisa y da confianza.
  console.error("check:bundle no encontró ningún archivo referenciado en index.html.");
  process.exit(1);
}

let total = 0;
const detalle = [];

for (const referencia of referencias) {
  const ruta = join(dist, referencia);
  const comprimido = gzipSync(readFileSync(ruta)).length;

  total += comprimido;
  detalle.push(`  ${referencia} — ${(comprimido / 1024).toFixed(1)} KB`);
}

const enKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const diferidos = archivosDe(join(dist, "assets")).length - referencias.length;

console.log(`Carga inicial (gzip): ${enKb(total)} de ${enKb(LIMITE_BYTES)}`);
console.log(detalle.join("\n"));
console.log(`  (${diferidos} archivo(s) más se cargan por ruta, y no cuentan aquí)`);

if (total > LIMITE_BYTES) {
  console.error(
    `\nEl presupuesto de ADR-014 son ${enKb(LIMITE_BYTES)} y la carga inicial pesa ${enKb(total)}.`,
  );
  console.error("Subir el límite está prohibido (regla de oro 12): parte la pantalla en rutas.");
  process.exit(1);
}

function archivosDe(carpeta) {
  try {
    return readdirSync(carpeta).filter((nombre) => statSync(join(carpeta, nombre)).isFile());
  } catch {
    return [];
  }
}
