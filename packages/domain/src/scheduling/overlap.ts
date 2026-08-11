/**
 * Un rango de tiempo, **semiabierto**: incluye su inicio y excluye su fin (R-040-04).
 *
 * La convención está escrita en un solo lugar —aquí y en la columna generada de la migración— y
 * eso es lo que importa: si cada módulo la decidiera por su cuenta, en algún borde aparecerían
 * choques o huecos falsos, y sólo en ese borde.
 */
export interface RangoDeTiempo {
  inicio: Date;
  fin: Date;
}

/**
 * ¿Estos dos rangos ocupan algún instante en común? (R-040-02, R-040-04)
 *
 * Son tres líneas y merece existir aparte: es la pregunta que van a hacer prácticas, copas y
 * clases, y tenerla en un solo lugar es lo que evita que cada módulo resuelva el borde a su
 * manera. Es además la misma regla que aplica `&&` sobre un `tstzrange` en PostgreSQL, así que la
 * aplicación y la base no pueden discrepar.
 *
 * **Lo que decide la convención semiabierta**: algo que termina a las 5:30 y algo que empieza a
 * las 5:30 **no** se solapan. Sin eso, el club no podría programar una práctica detrás de otra.
 *
 * **Un rango de duración cero no se solapa con nada**, ni consigo mismo: no contiene ningún
 * instante, así que no ocupa nada. No es un caso de negocio —la base lo rechaza con un `CHECK`—
 * pero la función tiene que responder lo mismo que la base si le llega uno.
 *
 * Ese caso hay que tratarlo aparte y no sale de la comparación: `a.inicio < b.fin && b.inicio <
 * a.fin` responde `true` para un rango vacío contenido en otro. Se escribió así primero, el test lo
 * atrapó, y `SELECT tstzrange(x,x) && tstzrange(...)` en PostgreSQL confirmó que responde `false`.
 * Sin el `esVacio`, la aplicación y la base discrepaban justo donde este comentario promete que no.
 */
export function seSolapan(a: RangoDeTiempo, b: RangoDeTiempo): boolean {
  if (esVacio(a) || esVacio(b)) {
    return false;
  }

  return a.inicio.getTime() < b.fin.getTime() && b.inicio.getTime() < a.fin.getTime();
}

/** Un rango que no contiene ningún instante. `isempty()` en PostgreSQL. */
function esVacio(rango: RangoDeTiempo): boolean {
  return rango.fin.getTime() <= rango.inicio.getTime();
}

/**
 * ¿El rango está bien formado? Termina después de empezar.
 *
 * Existe para que quien construye un rango pueda rechazarlo **antes** de intentar guardarlo: el
 * `CHECK` de la base lo atrapa igual, pero con un error de PostgreSQL en vez de uno que la persona
 * pueda entender.
 */
export function esRangoValido(rango: RangoDeTiempo): boolean {
  return rango.fin.getTime() > rango.inicio.getTime();
}
