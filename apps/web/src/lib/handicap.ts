/**
 * Medios goles ↔ texto, para la interfaz (T-340).
 *
 * **La conversión a texto no vive en el dominio** (constitución, regla 1): `1.5` se escribe «1,5»
 * en es-CO, y eso es presentación. El dominio expone el número; aquí se decide cómo se lee.
 *
 * El signo menos es el de verdad (−, U+2212), no un guión: en un handicap de −2 el guión se ve
 * como un separador y confunde.
 */
export function handicapEnGoles(valueHalves: number): string {
  const goles = valueHalves / 2;
  const texto = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(Math.abs(goles));

  return goles < 0 ? `−${texto}` : texto;
}

/** Lo que escribe el comisario —«2,5» o «-1»— a medios goles. `null` si no es un handicap. */
export function golesAMediosGoles(texto: string): number | null {
  const normalizado = texto.trim().replace(",", ".").replace("−", "-");

  if (normalizado === "") {
    return null;
  }

  const goles = Number(normalizado);

  if (!Number.isFinite(goles)) {
    return null;
  }

  const medios = goles * 2;

  // Ni redondea ni acomoda: 2,3 no es un handicap y se rechaza. Redondearlo dejaría al jugador con
  // un valor que nadie eligió (mismo criterio que `goalsToHalves` en el dominio).
  return Number.isInteger(medios) ? medios : null;
}
