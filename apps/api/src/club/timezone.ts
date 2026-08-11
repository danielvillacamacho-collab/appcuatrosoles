/**
 * ¿Existe esta zona horaria?
 *
 * Se valida contra `Intl` y no contra una lista propia: la base de datos de zonas cambia —países
 * que cambian de huso, zonas que se agregan— y una lista escrita a mano envejece sin que nadie se
 * entere hasta que un club de un país nuevo no puede darse de alta.
 */
export function esZonaHorariaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });

    return true;
  } catch {
    return false;
  }
}
