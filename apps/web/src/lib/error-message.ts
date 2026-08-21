import { ApiError, NetworkError } from "./api-client.js";
import { copy } from "../i18n/es-CO.js";

/**
 * De un error a la frase que ve la persona (T-122, `plan.md` §9.3).
 *
 * **Nunca devuelve el `message` que mandó el API.** Ese texto está en español y es correcto, pero
 * se escribió sin saber en qué pantalla iba a aparecer —«La operación no cumple una regla del
 * club» es cierto y no le sirve a nadie que está tratando de entrar— y además vive fuera de
 * `es-CO.ts`, donde el club no puede revisarlo ni corregirlo (regla de oro 1).
 *
 * Lo que sí usa es el `code`, que **es contrato**: `docs/03` §2 lo declara estable y ramificable
 * por el cliente, mientras que el mensaje puede reescribirse cuando quiera.
 */
export function mensajeDeError(error: unknown): string {
  if (error instanceof NetworkError) {
    // Distinto del resto a propósito: aquí no falló una regla del club, falló el camino hasta él,
    // y lo único útil que se le puede decir a alguien es que revise su conexión.
    return copy.errores.sinRed;
  }

  if (error instanceof ApiError) {
    const texto = textoDeCodigo(error.data.code);

    // **La referencia se muestra sólo cuando no tenemos una explicación.**
    //
    // Si el error es una regla del club —«esa cancha ya está ocupada»— la persona sabe qué hacer y
    // un código de doce caracteres sólo estorba. Si en cambio salió el mensaje genérico, nadie
    // sabe qué pasó: ahí la referencia es lo único que convierte «no me dejó guardar» en una línea
    // de log encontrable, que es exactamente lo que hace falta mientras el club está probando.
    return texto === copy.errores.generico ? conReferencia(texto, error.data.requestId) : texto;
  }

  return copy.errores.generico;
}

/** El identificador que el API ya devuelve en cada error y que quedó registrado con el stack. */
function conReferencia(texto: string, requestId: string): string {
  return requestId === "" ? texto : `${texto} ${copy.comun.referenciaDeError(requestId)}`;
}

/**
 * El texto de un código, o el genérico **avisando en consola**.
 *
 * El aviso es la mitad importante: un código sin traducir no rompe la pantalla, así que sin él la
 * falta se descubriría meses después, cuando alguien reporte que «salió un error raro». Con él se
 * ve al escribir la función que produce ese error.
 */
export function textoDeCodigo(code: string): string {
  const textos: Record<string, string> = copy.errores;
  const texto = textos[code];

  if (texto === undefined) {
    console.warn(`[i18n] Falta el texto del error «${code}» en i18n/es-CO.ts`);

    return copy.errores.generico;
  }

  return texto;
}

/**
 * Los errores por campo que devuelve el API cuando un cuerpo no cumple su esquema
 * (`details.fields` de `docs/03` §3), listos para pintarlos junto a cada input.
 *
 * Los mensajes de Zod vienen del servidor y en inglés, así que **no se muestran**: lo que se
 * devuelve es qué campos fallaron. El formulario decide qué decir de cada uno, porque es el único
 * que sabe cómo se llama ese campo en su pantalla.
 */
export function camposConError(error: unknown): string[] {
  if (!(error instanceof ApiError)) {
    return [];
  }

  const campos = error.data.details?.["fields"];

  return campos !== null && typeof campos === "object" ? Object.keys(campos) : [];
}
