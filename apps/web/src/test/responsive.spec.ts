import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RUTAS = resolve(import.meta.dirname, "../routes");
const COMPONENTES = resolve(import.meta.dirname, "../components");
const CSS = resolve(import.meta.dirname, "../index.css");

function archivos(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);

    if (statSync(ruta).isDirectory()) return archivos(ruta);

    return nombre.endsWith(".tsx") && !nombre.includes(".spec.") && !nombre.endsWith(".gen.ts")
      ? [ruta]
      : [];
  });
}

/**
 * Que la interfaz siga siendo responsive (`docs/04` §2).
 *
 * Estos tests no miran píxeles: miran las dos decisiones que se tomaron mal la primera vez y que,
 * al tomarse mal, **sólo se notan en un monitor ancho** — que es justo donde nadie prueba cuando
 * está construyendo mobile-first.
 */
describe("Responsive: las dos cosas que se hicieron mal la primera vez", () => {
  it("el fondo lo pinta el documento, no cada pantalla", () => {
    // Estaba en el `<main>` de cada ruta, que tiene ancho máximo: en un monitor el color del club
    // terminaba a los 672 px y el resto lo pintaba el navegador con su fondo por defecto. En un
    // celular no se veía nunca, porque ahí el `<main>` ocupa todo el ancho.
    const css = readFileSync(CSS, "utf8");

    expect(css).toMatch(/html\s*\{[^}]*background:\s*var\(--color-cream\)/u);

    // Se busca el fondo **de la pantalla**, no cualquier aparición: `hover:bg-cream` sobre una fila
    // de tabla es un estado del ratón y no tiene nada que ver con esto.
    const conFondoPropio = archivos(RUTAS)
      .filter((ruta) => /(?<!hover:|focus:|active:)\bbg-cream\b/u.test(readFileSync(ruta, "utf8")))
      .map((ruta) => ruta.slice(RUTAS.length + 1));

    expect(conFondoPropio).toEqual([]);
  });

  it("ninguna pantalla se queda encerrada en un ancho de celular", () => {
    // `max-w-2xl` sin punto de quiebre deja 768 px de pantalla vacía en un monitor. El marco
    // compartido (`components/Pantalla.tsx`) decide el ancho por tramos; una ruta que fije el suyo
    // a mano se sale de esa decisión sin que nadie lo note.
    const sospechosas = archivos(RUTAS)
      .filter((ruta) => /max-w-(xs|sm|md|lg|xl|2xl)\b/u.test(readFileSync(ruta, "utf8")))
      .map((ruta) => ruta.slice(RUTAS.length + 1));

    // Las pantallas sin sesión sí se quedan estrechas a propósito: un formulario de dos campos
    // estirado a 1400 px se lee peor, no mejor. Usan `PantallaDeEntrada`, que lo declara una vez.
    expect(sospechosas).toEqual([]);
  });

  it("el marco compartido crece por tramos, no de golpe", () => {
    const marco = readFileSync(join(COMPONENTES, "Pantalla.tsx"), "utf8");

    // Padding que crece y anchos distintos para leer y para tabular.
    expect(marco).toContain("sm:px-6");
    expect(marco).toContain("max-w-6xl");
    expect(marco).toContain("max-w-3xl");
  });
});
