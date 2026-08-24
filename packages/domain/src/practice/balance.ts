import type { HandicapHalves } from "../handicap/halves.js";

/** Un puesto listo para repartir: sólo su identificador y cuánto pesa. */
export interface PuestoAsignable {
  id: string;
  handicapHalves: HandicapHalves;
}

export interface Reparto {
  equipoA: readonly string[];
  equipoB: readonly string[];
  /** La diferencia entre las dos sumas, siempre positiva. Es lo que el comisario mira. */
  diferenciaHalves: number;
}

/**
 * Cuánto pesa un puesto (`specs/051` R-051-06).
 *
 * **El más alto de los dos, ni la suma ni el promedio.** Es la regla del polo: cuando dos jugadores
 * comparten puesto, en la cancha ese puesto rinde como el mejor de los dos, porque juega cada uno
 * los chukkers que puede. Sumarlos inventaría un puesto que no existe; promediarlos castigaría al
 * bueno por acompañar a alguien.
 */
export function handicapDelPuesto(
  titular: HandicapHalves,
  companero: HandicapHalves | null,
): HandicapHalves {
  return companero === null || companero < titular ? titular : companero;
}

/**
 * El reparto **más parejo posible** en dos equipos (R-051-02, R-051-03, R-051-04).
 *
 * **Exacto, no aproximado.** «Lo más parejo posible» es lo que alguien va a auditar el día que no
 * le guste su equipo, así que conviene que sea literalmente cierto. El reparto codicioso —«el más
 * fuerte al equipo que va más liviano»— es más fácil de escribir y **no siempre acierta**: con
 * handicaps `[4, 3.5, 3, 2.5, 2]` deja una diferencia de un gol donde existe un reparto perfecto.
 *
 * Se resuelve con programación dinámica sobre `(cuántos puestos van en A, cuánto suman)`. Cuesta
 * `O(n² · S)` con `S` la suma total, así que el máximo que permite el contrato —40 puestos— son
 * poco más de un millón de estados: instantáneo. No hay un segundo camino aproximado, y por lo
 * tanto no hay dos comportamientos que explicar.
 *
 * **Los equipos quedan parejos en cantidad** (R-051-03): con número impar, A se queda con el de
 * más. Dejarlos desparejos es una decisión del comisario, no una propuesta del sistema.
 */
export function balancearEquipos(puestos: readonly PuestoAsignable[]): Reparto {
  // El orden de entrada no puede cambiar el resultado (R-051-04). Se normaliza acá, una vez.
  const ordenados = [...puestos].sort(
    (a, b) => b.handicapHalves - a.handicapHalves || a.id.localeCompare(b.id),
  );

  const total = ordenados.reduce((suma, puesto) => suma + puesto.handicapHalves, 0);
  const enA = Math.ceil(ordenados.length / 2);

  const elegidos = elegirParaA(ordenados, enA, total);
  const equipoA = ordenados.filter((_, i) => elegidos.has(i)).map((puesto) => puesto.id);
  const equipoB = ordenados.filter((_, i) => !elegidos.has(i)).map((puesto) => puesto.id);
  const sumaA = ordenados.reduce(
    (suma, puesto, i) => (elegidos.has(i) ? suma + puesto.handicapHalves : suma),
    0,
  );

  return { equipoA, equipoB, diferenciaHalves: Math.abs(2 * sumaA - total) };
}

/**
 * Qué índices van al equipo A: los que dejan la diferencia más chica, con exactamente `enA` puestos.
 *
 * Los handicaps pueden ser negativos —−2 goles es `-4` medios— y una tabla indexada por suma no
 * admite índices negativos, así que se trabaja con la suma **desplazada**: a cada puesto se le resta
 * el mínimo para que todos sean ≥ 0, y el objetivo se corrige. Sin ese desplazamiento, un club con
 * principiantes rompería el reparto, que es justamente donde más falta hace.
 *
 * Las dos tablas son **planas** y no arreglos de arreglos: indexar un `Uint8Array` devuelve un
 * número y no «número o nada», así que el código queda sin comprobaciones de existencia que no
 * dicen nada y sin afirmaciones de no-nulo, que el repo prohíbe con razón.
 */
function elegirParaA(
  puestos: readonly PuestoAsignable[],
  enA: number,
  total: number,
): ReadonlySet<number> {
  const n = puestos.length;

  if (n === 0) {
    return new Set();
  }

  const desplazamiento = Math.min(0, ...puestos.map((puesto) => puesto.handicapHalves));
  const pesos = Int32Array.from(puestos, (puesto) => puesto.handicapHalves - desplazamiento);
  const maximo = pesos.reduce((suma, peso) => suma + peso, 0);
  const ancho = maximo + 1;

  // `alcanzable[k * ancho + s]`: ¿se puede armar un grupo de `k` puestos que sume `s`?
  // `vino` guarda con qué puesto se llegó a ese estado, para poder desandarlo.
  const alcanzable = new Uint8Array((enA + 1) * ancho);
  const vino = new Int32Array((enA + 1) * ancho).fill(-1);

  alcanzable[0] = 1;

  // Los `?? 0` y `?? -1` de acá abajo **son inalcanzables**: todos los índices están dentro de
  // rango por construcción. Existen porque el proyecto compila con índices opcionales, que es lo
  // que evita el error de verdad —leer fuera de rango sin darse cuenta— a cambio de un puñado de
  // ramas que ninguna prueba puede recorrer. No hay caso que buscar detrás de ellas.
  for (let i = 0; i < n; i += 1) {
    const peso = pesos[i] ?? 0;

    // Hacia atrás en `k`: así cada puesto se usa una sola vez.
    for (let k = Math.min(enA, i + 1); k >= 1; k -= 1) {
      for (let s = maximo - peso; s >= 0; s -= 1) {
        if (alcanzable[(k - 1) * ancho + s] === 1 && alcanzable[k * ancho + s + peso] === 0) {
          alcanzable[k * ancho + s + peso] = 1;
          vino[k * ancho + s + peso] = i;
        }
      }
    }
  }

  // De todas las sumas alcanzables con `enA` puestos, la que deja la diferencia más chica.
  //
  // El objetivo va **en la escala desplazada**, que es en la que están las sumas de la tabla: la
  // mitad del total, más el desplazamiento aplicado a los `enA` puestos del grupo. Escribirlo como
  // `(total - desplazamiento * enA) / 2` —dividiendo también el desplazamiento— da el objetivo
  // equivocado en cuanto hay un handicap negativo, y el test de principiantes lo encontró.
  // Arranca **sin candidato** y no en cero: con un solo puesto, la suma cero no es alcanzable para
  // un grupo de uno, y dar por buena una suma que no existe deja el reparto vacío. Lo encontró el
  // test del puesto único.
  const objetivo = total / 2 - desplazamiento * enA;
  let mejor = -1;

  for (let s = 0; s <= maximo; s += 1) {
    if (
      alcanzable[enA * ancho + s] === 1 &&
      (mejor === -1 || Math.abs(s - objetivo) < Math.abs(mejor - objetivo))
    ) {
      mejor = s;
    }
  }

  // Desandar la tabla. El `for` acota las vueltas al número de puestos del grupo: cada paso quita
  // uno, así que termina siempre.
  const elegidos = new Set<number>();
  let suma = mejor;

  for (let k = enA; k > 0; k -= 1) {
    const i = vino[k * ancho + suma] ?? -1;

    elegidos.add(i);
    suma -= pesos[i] ?? 0;
  }

  return elegidos;
}
