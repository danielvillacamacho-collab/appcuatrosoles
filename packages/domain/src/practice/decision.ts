/** En qué estado está la práctica, de lo que le importa a la decisión. */
export type EstadoDePractica = "draft" | "published" | "confirmed" | "cancelled";

export interface PracticaADecidir {
  estado: EstadoDePractica;
  minimo: number;
  decisionAt: Date;
}

/**
 * Qué hay que hacer con esta práctica.
 *
 * `todavia_no` y `ya_decidida` son resultados normales, no errores: el proceso de decisión los
 * encuentra todo el tiempo.
 */
export type Decision = "confirmar" | "cancelar" | "todavia_no" | "ya_decidida";

/**
 * La decisión automática (`specs/050` HU-050-04).
 *
 * **No escribe nada ni avisa a nadie**: devuelve qué hay que hacer, y hacerlo es del servicio. Es
 * lo que permite probar los cuatro casos —incluida la práctica ya decidida y el sistema que estuvo
 * caído— sin base de datos y sin correo.
 *
 * El reloj entra como parámetro (P-08). Un `new Date()` aquí haría imposible probar «el sistema
 * volvió tres horas tarde», que es justamente el caso que R-050-11 promete.
 */
export function decidirPractica(
  practica: PracticaADecidir,
  puestosDentro: number,
  ahora: Date,
): Decision {
  if (practica.estado !== "published") {
    // Un borrador no se decide solo, y una práctica ya confirmada o cancelada no se vuelve a
    // decidir. Es de donde sale la idempotencia del proceso (R-050-10): la consulta pide las
    // publicadas, y decidir cambia el estado.
    return "ya_decidida";
  }

  if (ahora.getTime() < practica.decisionAt.getTime()) {
    return "todavia_no";
  }

  // A la hora exacta ya se decide. Es un vencimiento, no un rango: «a las 6:00 p.m. se decide»
  // significa que a las 6:00 p.m. en punto está decidido.
  return puestosDentro >= practica.minimo ? "confirmar" : "cancelar";
}

/**
 * ¿Se puede entrar o salir todavía? (R-050-09)
 *
 * Semiabierto como todo en el repo: a la hora exacta del cierre **ya está cerrado**. Después de esa
 * hora, bajarse tiene consecuencias, y ésas las decide `specs/110`.
 */
export function estaAbiertaLaPostulacion(practica: { closeAt: Date }, ahora: Date): boolean {
  return ahora.getTime() < practica.closeAt.getTime();
}
