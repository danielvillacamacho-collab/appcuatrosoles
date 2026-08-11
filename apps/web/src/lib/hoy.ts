/**
 * El día de hoy **según el reloj del dispositivo**, como fecha de calendario.
 *
 * La regla del repo prohíbe `new Date()` sin argumentos porque en el servidor «ahora» se inyecta
 * (P-08). Aquí es el navegador: no hay Clock que inyectar, y el único uso es elegir a qué día
 * abrir el calendario cuando la URL no lo trae — una preferencia de navegación, no una regla de
 * negocio. Toda decisión que dependa del tiempo la toma el API con su propio reloj.
 */
export function hoy(timeZone?: string): string {
  // eslint-disable-next-line no-restricted-syntax -- el reloj del dispositivo ES el dato aquí.
  const ahora = new Date();

  const formato = new Intl.DateTimeFormat("en-CA", {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // `en-CA` produce YYYY-MM-DD directamente.
  return formato.format(ahora);
}
