/**
 * La versión del waiver que rige hoy en el club. Cuál es «la vigente» —la de mayor correlativo ya
 * publicada— lo resuelve el repositorio (T-073); aquí llega ya elegida.
 */
export interface WaiverVersionRef {
  id: string;
}

/**
 * La aceptación **más reciente** de la persona, o nula si nunca aceptó ninguna.
 *
 * Que sea la más reciente es responsabilidad de quien consulta: pasar una vieja teniendo otra
 * nueva devuelve `false`, es decir, vuelve a pedir la aceptación. El error se paga con una
 * pantalla de más, nunca con alguien jugando sin respaldo legal.
 */
export interface WaiverAcceptanceRef {
  waiverVersionId: string;
}

/**
 * ¿Tiene esta persona aceptación vigente del waiver? (R-010-12, HU-010-11)
 *
 * **Se compara por identificador de versión, no por número de versión.** El correlativo `version`
 * es por club (`schema.prisma`, `@@unique([clubId, version])`), así que la «versión 3» existe en
 * todos los clubes a la vez: comparar números haría que la aceptación firmada en un club diera por
 * cubierta a la persona en otro, que es exactamente la fuga entre inquilinos que prohíbe P-05. El
 * identificador es único en toda la plataforma y no admite esa confusión.
 *
 * Implementa la política por defecto `identity.waiver_renewal_policy` (`docs/08` §9): se acepta una
 * vez y sólo se vuelve a pedir si el texto cambia — es decir, si hay versión nueva. Una política
 * con vencimiento por tiempo («revalidar cada año») exigiría un `Clock` y no está en v1; cuando se
 * pida, entra por aquí.
 */
export function isWaiverAcceptanceCurrent(
  acceptance: WaiverAcceptanceRef | null,
  currentVersion: WaiverVersionRef,
): boolean {
  if (acceptance === null) {
    return false;
  }

  return acceptance.waiverVersionId === currentVersion.id;
}
