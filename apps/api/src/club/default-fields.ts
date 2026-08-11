/**
 * Las canchas con las que nace un club (T-402, `docs/08` §5, clave `field.count`).
 *
 * **Se numeran, no se nombran.** «Cancha 1», «Cancha 2», «Cancha 3» es como las llama el club al
 * hablar, y un nombre inventado —«Principal», «Norte»— obligaría a renombrarlas el primer día. El
 * administrador las renombra si quiere; lo que no puede es empezar sin ninguna y descubrirlo cuando
 * intenta programar la primera práctica.
 */
export function canchasPorDefecto(cuantas: number): { name: string }[] {
  return Array.from({ length: Math.max(0, Math.trunc(cuantas)) }, (_, indice) => ({
    name: `Cancha ${indice + 1}`,
  }));
}
