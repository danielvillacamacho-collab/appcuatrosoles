/**
 * Esperar una mutación **sin dejar el rechazo suelto**.
 *
 * Cuando una mutación falla, `mutateAsync` devuelve una promesa rechazada. Si quien la llamó sólo
 * la esperaba para decidir si navegar, ese rechazo no lo captura nadie: en los tests aparece como
 * «unhandled error» —y hace fallar la suite entera aunque todos los tests pasen—, y en el navegador
 * queda un `unhandledrejection` que ensucia la consola de cualquiera que esté depurando otra cosa.
 *
 * **El error no se pierde**: TanStack Query ya lo guarda en `isError`/`error`, que es de donde las
 * pantallas lo muestran. Lo único que se descarta acá es la promesa rechazada, que no aporta nada
 * porque el estado ya lo cuenta.
 *
 * Para una mutación que se dispara y no se espera, no hace falta nada de esto: `mutate` en vez de
 * `mutateAsync` y ya, porque `mutate` no devuelve una promesa que pueda rechazar.
 */

/** ¿Salió bien? Para mutaciones cuyo valor de vuelta no se usa. */
export async function salioBien(promesa: Promise<unknown>): Promise<boolean> {
  return promesa.then(
    () => true,
    () => false,
  );
}

/** El valor, o `null` si falló. Para cuando lo que devuelve la mutación se necesita después. */
export async function oNulo<T>(promesa: Promise<T>): Promise<T | null> {
  return promesa.then(
    (valor) => valor,
    () => null,
  );
}
