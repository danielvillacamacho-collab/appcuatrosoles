import type { LocalDate } from "../shared/localDate.js";

/**
 * Años cumplidos entre dos fechas de calendario (HU-010-10).
 *
 * Se calcula comparando texto, no restando instantes: `(hoy - nacimiento) / 365.25` se equivoca
 * cerca del cumpleaños de quien nació en año bisiesto, y aquí el borde importa — de él depende si
 * un perfil de menor puede seguir existiendo sin cuenta propia.
 *
 * Devuelve `null` si la fecha de nacimiento es posterior a hoy: no es «edad cero», es un dato que
 * no puede ser, y quien llame tiene que decidir qué hacer con eso.
 */
export function edadCumplida(nacimiento: LocalDate, hoy: LocalDate): number | null {
  if (nacimiento > hoy) {
    return null;
  }

  const [anoNac, mesNac, diaNac] = partes(nacimiento);
  const [anoHoy, mesHoy, diaHoy] = partes(hoy);

  const cumplioEsteAno = mesHoy > mesNac || (mesHoy === mesNac && diaHoy >= diaNac);

  return anoHoy - anoNac - (cumplioEsteAno ? 0 : 1);
}

/**
 * ¿Esta persona todavía cabe en un perfil de menor?
 *
 * El límite **no es una constante**: sale de `identity.minor_profile_max_age`, que cada club
 * define (`docs/08` §9, P-04). Un club puede querer 18 y otro 21 según cómo organice sus
 * categorías, y ninguno debería necesitar un despliegue para cambiarlo.
 *
 * Importa que sea una regla y no una validación de formulario: un perfil de menor es una persona
 * **sin cuenta propia**, administrada por otro. Dejar crear uno para un adulto es dejar que
 * alguien administre la vida deportiva de una persona que debería tener su propia contraseña.
 */
export function cabeEnPerfilDeMenor(
  nacimiento: LocalDate,
  hoy: LocalDate,
  edadMaxima: number,
): boolean {
  const edad = edadCumplida(nacimiento, hoy);

  return edad !== null && edad < edadMaxima;
}

function partes(fecha: LocalDate): [number, number, number] {
  const [ano, mes, dia] = fecha.split("-");

  return [Number(ano), Number(mes), Number(dia)];
}
