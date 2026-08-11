import { err, ok, type Result } from "../shared/result.js";

/**
 * Longitud máxima de una etiqueta de nombre de host (RFC 1035). No es una preferencia nuestra: un
 * subdominio más largo no resuelve en el DNS.
 */
const LARGO_MAXIMO = 63;
const LARGO_MINIMO = 2;

/**
 * **La misma expresión que el CHECK de la base de datos** (`club_slug_formato`, T-201).
 *
 * Que estén en dos lugares es deliberado y tiene un costo conocido: si se cambia una y no la otra,
 * la aplicación acepta algo que la base rechaza y el usuario recibe un `500` donde debería recibir
 * un mensaje claro. Se duplica igual porque cada capa protege de algo distinto —la base, de
 * cualquier vía de escritura; el dominio, de aceptar y luego fallar— y hay un test que las compara.
 */
const FORMATO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Subdominios que no se pueden asignar a un club porque ya significan otra cosa.
 *
 * No estaba en el spec y se agrega aquí con una razón concreta: si un club tomara `www`, `api` o
 * `admin`, la resolución de tenant lo serviría en una dirección que el resto del sistema —o el
 * navegador de cualquiera— espera que sea otra cosa. El caso feo no es que falle: es que
 * **funcione**, y que el club quede accesible desde donde no debe.
 *
 * Se conserva corta a propósito. Cada nombre reservado es un nombre que un cliente real no puede
 * usar, y reservar de más es tan malo como reservar de menos.
 */
const RESERVADOS = new Set([
  "www",
  "api",
  "admin",
  "app",
  "static",
  "assets",
  "mail",
  "staging",
  "localhost",
]);

export type SlugRejection =
  | "slug_vacio"
  | "slug_muy_corto"
  | "slug_muy_largo"
  | "slug_formato_invalido"
  | "slug_reservado";

/**
 * Normaliza lo que escribió una persona: recorta espacios y baja a minúsculas.
 *
 * **No arregla el resto a la fuerza.** Convertir «Los Pinos» en `los-pinos` en silencio parece
 * amable hasta que alguien crea el club creyendo que su dirección es una y resulta ser otra —y el
 * subdominio es lo que va impreso en el correo de invitación de todos sus socios. Se normaliza lo
 * que no cambia el significado y se rechaza lo demás, diciendo qué pasa.
 */
export function normalizeSlug(entrada: string): string {
  return entrada.trim().toLowerCase();
}

/** ¿Sirve esta cadena como subdominio de un club? (R-020-03) */
export function validateSlug(entrada: string): Result<string, SlugRejection> {
  const slug = normalizeSlug(entrada);

  if (slug.length === 0) return err("slug_vacio");
  if (slug.length < LARGO_MINIMO) return err("slug_muy_corto");
  if (slug.length > LARGO_MAXIMO) return err("slug_muy_largo");
  if (!FORMATO.test(slug)) return err("slug_formato_invalido");
  if (RESERVADOS.has(slug)) return err("slug_reservado");

  return ok(slug);
}

/** Para el test que compara esta regla con la de la base de datos, y para quien quiera leerla. */
export const SLUG_FORMATO = FORMATO;
export const SLUG_RESERVADOS: ReadonlySet<string> = RESERVADOS;
