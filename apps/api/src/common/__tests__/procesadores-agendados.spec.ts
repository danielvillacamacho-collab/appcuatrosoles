import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * **Todo procesador tiene quien lo dispare.**
 *
 * Este test existe porque faltó uno. `DecisionProcessor` quedó construido, probado con trece tests
 * de integración y **sin que nadie lo llamara en producción**: las prácticas se habrían quedado
 * publicadas para siempre, sin confirmarse ni cancelarse, y sin un solo error que lo delatara. Los
 * tests pasaban porque el procesador se llama a mano en ellos, que es justo lo que esconde el
 * problema.
 *
 * No lo encontró ninguna prueba: lo encontró revisar el repo a mano antes de avisarle al equipo de
 * infraestructura. Ésta es la red que faltaba.
 *
 * La regla es de nombres a propósito. Podría inspeccionarse el contenedor de NestJS, pero un
 * procesador que nadie registra tampoco aparecería ahí: lo que hay que comprobar es que el archivo
 * exista, y eso se ve en el disco.
 */
describe("Procesadores y agendadores", () => {
  const procesadores = archivosQueTerminanEn(".processor.ts");
  const agendadores = new Set(
    archivosQueTerminanEn(".scheduler.ts").map((ruta) => ruta.replace(".scheduler.ts", "")),
  );

  it("hay al menos un procesador que comprobar", () => {
    // Si un renombre masivo dejara la lista vacía, este test pasaría en silencio sin comprobar nada.
    expect(procesadores.length).toBeGreaterThan(0);
  });

  it("cada procesador tiene su agendador al lado", () => {
    const huerfanos = procesadores.filter(
      (ruta) => !agendadores.has(ruta.replace(".processor.ts", "")),
    );

    expect(
      huerfanos,
      "un procesador sin agendador no corre nunca en producción, y ningún test lo nota",
    ).toEqual([]);
  });

  it("cada agendador se registra en un módulo", () => {
    // La otra mitad: un agendador que existe pero que ningún módulo declara como proveedor tampoco
    // se instancia, así que NestJS nunca llama a su `onApplicationBootstrap`.
    const modulos = archivosQueTerminanEn(".module.ts")
      .map((ruta) => readFileSync(join(SRC, ruta), "utf8"))
      .join("\n");

    const sinRegistrar = [...agendadores].filter(
      (base) => !modulos.includes(`${nombreDeClase(base)}`),
    );

    expect(sinRegistrar).toEqual([]);
  });
});

/** `practices/decision` → `DecisionScheduler`. */
function nombreDeClase(base: string): string {
  const archivo = base.split("/").pop() ?? "";

  return `${archivo.charAt(0).toUpperCase()}${archivo.slice(1)}Scheduler`;
}

function archivosQueTerminanEn(sufijo: string): string[] {
  const encontrados: string[] = [];

  const recorrer = (carpeta: string): void => {
    for (const entrada of readdirSync(join(SRC, carpeta), { withFileTypes: true })) {
      const relativa = carpeta === "" ? entrada.name : `${carpeta}/${entrada.name}`;

      if (entrada.isDirectory()) {
        if (entrada.name !== "__tests__" && entrada.name !== "node_modules") {
          recorrer(relativa);
        }
      } else if (entrada.name.endsWith(sufijo)) {
        encontrados.push(relativa);
      }
    }
  };

  recorrer("");

  return encontrados;
}
