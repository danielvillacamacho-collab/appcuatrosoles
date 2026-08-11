import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ_WEB = resolve(import.meta.dirname, "..");
const TOKENS = resolve(RAIZ_WEB, "../../../packages/ui/src/tokens.css");

/** Un color escrito a mano: `#efe9db`, `#fff`, `rgb(…)`, `hsl(…)`. */
const COLOR_SUELTO = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu;

function archivosDeCodigo(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);

    if (statSync(ruta).isDirectory()) {
      return nombre === "routeTree.gen.ts" ? [] : archivosDeCodigo(ruta);
    }

    return /\.(tsx?|css)$/u.test(nombre) && !nombre.endsWith(".gen.ts") ? [ruta] : [];
  });
}

describe("Los tokens de marca son el único lugar donde vive un color (T-123, docs/04 §1)", () => {
  it("ningún archivo de la interfaz escribe un color a mano", () => {
    // La regla de `docs/04` §1: un tono nuevo se agrega primero a `tokens.css` con su
    // justificación. Sin este test la regla es una recomendación, y basta un `#fff` apurado en un
    // componente para que el día que el club cambie su color de marca (`specs/140` HU-140-04) la
    // pantalla quede a medio pintar.
    const culpables = archivosDeCodigo(RAIZ_WEB)
      .filter((ruta) => !ruta.endsWith("design-tokens.spec.ts"))
      .filter((ruta) => COLOR_SUELTO.test(readFileSync(ruta, "utf8")))
      .map((ruta) => ruta.slice(RAIZ_WEB.length + 1));

    expect(culpables).toEqual([]);
  });

  it("los tokens se declaran en `@theme`, que es lo que genera las utilidades", () => {
    // Con `:root` a secas las variables existirían y las clases no: `bg-cream` no daría error, no
    // aparecería en ningún log, y el componente saldría sin fondo. Ya pasó una vez.
    const css = readFileSync(TOKENS, "utf8");

    expect(css).toMatch(/@theme\s*\{/u);
    expect(css).not.toMatch(/:root\s*\{/u);
  });

  it("están los colores del brandbook y el objetivo táctil mínimo", () => {
    const css = readFileSync(TOKENS, "utf8");

    for (const token of ["--color-coquelicot", "--color-brunswick", "--color-jonquil", "--font-sans"]) {
      expect(css, `falta ${token}`).toContain(token);
    }

    // `docs/04` §2: 44 px, sin excepción. Como token para que nadie tenga que acordarse del valor.
    expect(css).toContain("--spacing-tap: 44px");
  });
});
