/**
 * Lo que el calendario sabe de un evento **para decidir si mostrarlo** (R-040-07).
 *
 * Nada más que esto: quien decide no necesita saber de qué tipo es, ni de quién, ni a qué práctica
 * pertenece. Cuanto menos entra, menos puede filtrarse por descuido.
 */
export interface EventoDelCalendario {
  visibility: "public" | "private";
  /** La cuenta que lo creó. */
  createdById: string;
}

/**
 * Quién está mirando.
 *
 * `participa` lo calcula quien llama —el calendario sabe quién está inscrito a cada práctica, el
 * dominio no— y entra ya resuelto: el dominio no consulta nada (P-01).
 */
export interface QuienMira {
  /** `null` cuando no hay sesión. */
  userAccountId: string | null;
  participa: boolean;
}

/**
 * ¿Esta persona puede ver el detalle de este evento? (R-040-07)
 *
 * **La promesa que sostiene esta función**: nadie debe poder deducir del calendario quién toma
 * clases o taquea a cierta hora. El calendario muestra la ocupación de las canchas —eso es
 * información del club— pero no de quién es cada cosa.
 *
 * Tres formas de tener derecho al detalle, y ninguna más:
 *
 * 1. **Participar** del evento. Es su práctica, su clase.
 * 2. **Haberlo creado**. Quien programó un bloqueo o reservó una cancha ve lo que hizo.
 * 3. Que el evento sea **público**. Las prácticas y las copas del club lo son: son la vida del
 *    club, y esconderlas haría inútil el calendario.
 *
 * En cualquier otro caso, quien mira recibe cancha, inicio y fin, y la etiqueta «Ocupado» — sin
 * tipo, sin identificadores, sin nombres.
 *
 * **Sin sesión no hay detalle de nada**, ni siquiera de lo público. Hoy el calendario está detrás
 * del guard y este caso no puede ocurrir; existe decidido y probado para el día que alguien quiera
 * abrirlo al público, que es justo cuando nadie quiere estar decidiendo reglas de privacidad.
 */
export function puedeVerElDetalle(evento: EventoDelCalendario, quienMira: QuienMira): boolean {
  if (quienMira.userAccountId === null) {
    return false;
  }

  if (quienMira.participa) {
    return true;
  }

  if (evento.createdById === quienMira.userAccountId) {
    return true;
  }

  return evento.visibility === "public";
}
