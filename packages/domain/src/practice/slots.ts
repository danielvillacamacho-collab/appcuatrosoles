/** Una postulación vigente, en lo que el dominio necesita saber de ella. */
export interface Postulacion {
  id: string;
  personId: string;
  appliedAt: Date;
  chukkersOffered: number;
  /** A quién propuso como compañero de puesto. La pareja sólo existe si es recíproca. */
  halfManPartnerPersonId: string | null;
}

/**
 * Un **puesto** en la práctica: una persona sola, o dos que comparten (`specs/050` R-050-07).
 *
 * Los cupos se cuentan en puestos y no en personas. Una pareja de medios hombres ocupa uno.
 */
export interface Puesto {
  /**
   * Quien llegó primero de los dos. **Define la posición del puesto en la fila.**
   *
   * Que sea el primero y no el segundo es deliberado, y tiene una consecuencia que conviene ver:
   * cuando alguien que ya estaba en la fila forma pareja, **el puesto se queda donde estaba** y el
   * compañero entra a ese mismo lugar. Nadie se corre, porque el número de puestos no crece al
   * formarse una pareja — dos postulaciones sueltas que se emparejan pasan a ser un puesto, así que
   * la fila se acorta y alguien de la espera entra.
   *
   * Con el criterio contrario —la posición del segundo— quien ofreció compartir perdería el lugar
   * que ya se había ganado, que es justo lo contrario de lo que se quiere premiar.
   */
  titular: Postulacion;
  /** El compañero, cuando la propuesta es recíproca. */
  companero: Postulacion | null;
}

/**
 * Agrupa postulaciones sueltas y parejas **recíprocas** en puestos (R-050-08).
 *
 * Recíproca quiere decir que los dos se nombraron mutuamente. Una propuesta que el otro no
 * respondió **no forma pareja y no ocupa nada**: si bastara con nombrar a alguien, cualquiera
 * podría reservarle un lugar a un tercero que no se enteró.
 *
 * El caso que se olvida es el triángulo —A propone a B, B propone a C— y produce cupos fantasma si
 * se resuelve mirando sólo un lado.
 */
export function armarPuestos(postulaciones: readonly Postulacion[]): readonly Puesto[] {
  const porPersona = new Map(postulaciones.map((una) => [una.personId, una]));
  const yaUbicadas = new Set<string>();
  const puestos: Puesto[] = [];

  for (const postulacion of enOrden(postulaciones)) {
    if (yaUbicadas.has(postulacion.personId)) {
      continue;
    }

    const companero = parejaDe(postulacion, porPersona);

    yaUbicadas.add(postulacion.personId);

    if (companero !== null) {
      yaUbicadas.add(companero.personId);
    }

    puestos.push({ titular: postulacion, companero });
  }

  return puestos;
}

/**
 * Quién está dentro y quién en la lista de espera, por orden de llegada (R-050-06).
 *
 * **No se guarda: se calcula.** Es la decisión de diseño del módulo (`plan.md` §0.1). Como columna
 * habría que mantenerla —alguien se retira y hay que promover al siguiente— con un proceso que
 * puede fallar o quedarse a medias, y una fila marcada «dentro» que ya no debería estarlo es
 * indistinguible de una correcta. Calculándola, **retirarse promueve al siguiente sin que corra
 * nada**.
 */
export function repartirCupos(
  puestos: readonly Puesto[],
  cupos: number,
): { dentro: readonly Puesto[]; enEspera: readonly Puesto[] } {
  const ordenados = [...puestos].sort(porLlegada);
  const cabe = Math.max(0, cupos);

  return { dentro: ordenados.slice(0, cabe), enEspera: ordenados.slice(cabe) };
}

/** Dónde quedó una persona: dentro, en espera, o sin postulación. */
export function posicionDe(
  personId: string,
  reparto: { dentro: readonly Puesto[]; enEspera: readonly Puesto[] },
): { estado: "dentro" | "en_espera"; posicion: number } | null {
  const dentro = reparto.dentro.findIndex((puesto) => ocupa(puesto, personId));

  if (dentro >= 0) {
    return { estado: "dentro", posicion: dentro + 1 };
  }

  const enEspera = reparto.enEspera.findIndex((puesto) => ocupa(puesto, personId));

  if (enEspera >= 0) {
    // La posición en la espera se cuenta desde 1: «sos el segundo de la lista» se entiende; «sos el
    // noveno» —contando a los que ya están dentro— no dice nada útil.
    return { estado: "en_espera", posicion: enEspera + 1 };
  }

  return null;
}

function ocupa(puesto: Puesto, personId: string): boolean {
  return puesto.titular.personId === personId || puesto.companero?.personId === personId;
}

/**
 * El orden de la fila: cuándo se postuló, y **el identificador para desempatar**.
 *
 * El desempate no es cosmético. Dos postulaciones en el mismo milisegundo con un orden inestable
 * dan un corte distinto en cada lectura, y la misma persona vería «estás dentro» y «estás en
 * espera» en dos pantallazos seguidos. Los identificadores son uuid v7, que crecen con el tiempo.
 */
function porLlegada(a: Puesto, b: Puesto): number {
  const porTiempo = a.titular.appliedAt.getTime() - b.titular.appliedAt.getTime();

  return porTiempo !== 0 ? porTiempo : a.titular.id.localeCompare(b.titular.id);
}

function enOrden(postulaciones: readonly Postulacion[]): readonly Postulacion[] {
  return [...postulaciones].sort((a, b) => {
    const porTiempo = a.appliedAt.getTime() - b.appliedAt.getTime();

    return porTiempo !== 0 ? porTiempo : a.id.localeCompare(b.id);
  });
}

/** El compañero, sólo si los dos se nombraron mutuamente. */
function parejaDe(
  postulacion: Postulacion,
  porPersona: ReadonlyMap<string, Postulacion>,
): Postulacion | null {
  if (postulacion.halfManPartnerPersonId === null) {
    return null;
  }

  const propuesto = porPersona.get(postulacion.halfManPartnerPersonId);

  if (propuesto === undefined) {
    // Propuso a alguien que no se postuló. No hay pareja, y el proponente queda solo.
    return null;
  }

  return propuesto.halfManPartnerPersonId === postulacion.personId ? propuesto : null;
}
