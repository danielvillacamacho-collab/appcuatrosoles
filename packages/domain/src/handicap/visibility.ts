/** Quién pregunta. `personId` es nulo cuando no hay sesión. */
export interface QuienMiraElHistorial {
  personId: string | null;
  /** Administrador del club o de la organización: ve el historial, aunque no pueda editarlo. */
  esAdministrador: boolean;
  esComisario: boolean;
}

/** De quién es el historial, con sus acudientes ya resueltos por el servicio (P-01). */
export interface DeQuienEsElHistorial {
  personId: string;
  /** `person_id` de quienes están a cargo de esta persona (`specs/010`, HU-010-10). */
  acudientes: readonly string[];
}

/**
 * ¿Puede ver el historial completo de handicap de esta persona? (`specs/030` R-030-09)
 *
 * El **valor vigente** es público dentro del club: hace falta para entender cómo quedó armado un
 * equipo. El **historial** no, porque lleva el motivo de cada cambio, y el motivo por el que a
 * alguien le bajaron el handicap puede ser delicado.
 *
 * Lo ven cuatro: el comisario —que los fija—, los administradores del club, la propia persona, y
 * quien esté a cargo de ella. Un menor no inicia sesión: su historial lo consulta su acudiente,
 * que es quien responde por ese perfil.
 */
export function puedeVerElHistorial(
  quienMira: QuienMiraElHistorial,
  deQuien: DeQuienEsElHistorial,
): boolean {
  if (quienMira.personId === null) {
    // Sin sesión no se ve nada. Va primero y explícito: si algún día un rol se pudiera resolver
    // sin sesión, este caso seguiría cerrado.
    return false;
  }

  if (quienMira.esComisario || quienMira.esAdministrador) {
    return true;
  }

  if (quienMira.personId === deQuien.personId) {
    return true;
  }

  return deQuien.acudientes.includes(quienMira.personId);
}
