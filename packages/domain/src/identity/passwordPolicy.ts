import { err, ok, type Result } from "../shared/result.js";

/** Mínimo de `docs/06` §2. Corto a propósito: ver la nota de `LARGO_MAXIMO`. */
const LARGO_MINIMO = 8;

/**
 * Máximo, y no es una restricción de seguridad sino una defensa contra nosotros mismos: Argon2
 * hashea lo que le den, y una contraseña de un megabyte es una forma barata de tener al servidor
 * ocupado. 200 caracteres es más de lo que cualquier gestor de contraseñas genera.
 */
const LARGO_MAXIMO = 200;

/**
 * Las contraseñas que un atacante prueba primero.
 *
 * **La lista es corta y está en el código a propósito.** Las listas serias tienen millones de
 * entradas y viven en un servicio o en un archivo aparte; ésta cubre lo que la gente escribe
 * cuando el sistema le exige «ocho caracteres con letras y números» y quiere terminar rápido, que
 * es exactamente el caso que una regla de complejidad no atrapa por su cuenta.
 *
 * Incluye variantes en español porque el club es colombiano: una lista en inglés dejaría pasar
 * `contrasena1` sin parpadear.
 */
const COMUNES = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password1",
  "password123",
  "qwerty123",
  "abc12345",
  "admin123",
  "iloveyou1",
  "sunshine1",
  "princess1",
  "football1",
  "monkey123",
  "dragon123",
  "letmein123",
  "welcome1",
  "welcome123",
  "contrasena1",
  "contrasena123",
  "contraseña1",
  "contraseña123",
  "colombia1",
  "colombia123",
  "bogota123",
  "medellin1",
  "polo12345",
  "caballo1",
  "caballo123",
  "12345678a",
  "a12345678",
  "qwertyui1",
  "asdfghjk1",
]);

export type PasswordRejection =
  | "muy_corta"
  | "muy_larga"
  | "sin_letras"
  | "sin_numeros"
  | "demasiado_comun"
  | "contiene_el_correo";

/**
 * ¿Sirve esta contraseña? (`docs/06` §2, T-038)
 *
 * Cuatro reglas, y las cuatro salen del documento: largo mínimo, letras, números y no estar en la
 * lista de las más usadas. **No se exigen símbolos ni mayúsculas**, y eso es deliberado: las reglas
 * de complejidad barrocas producen `Password1!` en todas partes y una nota adhesiva en el monitor.
 * Lo que sí protege es el largo, y por eso el máximo es generoso — una frase larga vale más que un
 * jeroglífico de ocho.
 *
 * La quinta regla no estaba en el documento y se agrega con razón: **la contraseña no puede
 * contener el correo**. `maria@lospinos.co` con contraseña `maria123` cumple todo lo demás y es lo
 * primero que prueba cualquiera que vea la lista de socios.
 *
 * @param email correo de acceso de la cuenta, para la quinta regla. Opcional: el flujo de
 *   restablecimiento lo conoce, y una pantalla de registro anónimo podría no conocerlo todavía.
 */
export function validatePassword(
  contrasena: string,
  email?: string,
): Result<void, PasswordRejection> {
  if (contrasena.length < LARGO_MINIMO) return err("muy_corta");
  if (contrasena.length > LARGO_MAXIMO) return err("muy_larga");
  if (!/\p{L}/u.test(contrasena)) return err("sin_letras");
  if (!/\d/u.test(contrasena)) return err("sin_numeros");
  if (COMUNES.has(contrasena.toLowerCase())) return err("demasiado_comun");

  if (email !== undefined && contieneElCorreo(contrasena, email)) {
    return err("contiene_el_correo");
  }

  return ok(undefined);
}

/**
 * Compara contra el correo entero y contra su parte local: quien usa `maria@lospinos.co` casi
 * nunca pone el correo completo, pone `maria`. La comparación es sin mayúsculas y exige que la
 * parte local tenga al menos tres caracteres — con dos, cualquier contraseña la contendría por azar.
 */
function contieneElCorreo(contrasena: string, email: string): boolean {
  const enMinusculas = contrasena.toLowerCase();
  const correo = email.trim().toLowerCase();
  // `replace` y no `split(...)[0]`: eso último obliga a un `?? ""` para un caso que no puede
  // ocurrir, y una rama que no se puede ejecutar es una rama que nadie puede probar.
  const parteLocal = correo.replace(/@.*$/u, "");

  if (correo.length > 0 && enMinusculas.includes(correo)) return true;

  return parteLocal.length >= 3 && enMinusculas.includes(parteLocal);
}

/** Para el test que comprueba que la lista no está vacía, y para quien quiera leerla. */
export const PASSWORDS_COMUNES: ReadonlySet<string> = COMUNES;
