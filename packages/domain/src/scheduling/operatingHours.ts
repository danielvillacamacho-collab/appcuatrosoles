import { err, ok, type Result } from "../shared/result.js";
import type { RangoDeTiempo } from "./overlap.js";

/**
 * El horario en el que el club deja programar, tal como se guarda en configuración:
 * `"06:00-18:00"` (`field.operating_hours`).
 *
 * Es texto y no dos números porque así se lee en el catálogo de `docs/08` y así lo va a escribir
 * quien lo configure. La conversión vive aquí, en un solo lugar.
 */
export type HorarioDeOperacion = string;

export type RechazoDeHorario =
  /** El horario configurado no tiene la forma `HH:MM-HH:MM`. */
  | "horario_mal_escrito"
  /** Empieza antes de la apertura. */
  | "antes_de_abrir"
  /** Termina después del cierre. */
  | "despues_de_cerrar"
  /** Cruza la medianoche o dura más de un día: no cabe en una ventana diaria. */
  | "no_cabe_en_un_dia";

/**
 * ¿Se puede programar esto? (R-040-06)
 *
 * **Existe porque las canchas no tienen iluminación** (`specs/040` §13): lo que acota el día es la
 * luz natural. Por eso el horario es del club y no de cada cancha, y por eso entra como parámetro
 * en vez de ser una constante — un club en otra latitud tiene otras horas de luz, y ninguno
 * debería necesitar un despliegue para decirlo (P-04).
 *
 * La zona horaria también entra como parámetro: «las seis de la tarde» es una hora de pared, y
 * saber a qué instante corresponde exige saber dónde queda el club (regla de oro 9).
 *
 * Devuelve un `Result` y no un booleano porque los tres motivos de rechazo llevan a mensajes
 * distintos: «el club abre a las 6:00» no es lo mismo que «el club cierra a las 18:00», y con un
 * booleano quien llama tendría que volver a calcular cuál fue para decirlo.
 */
export function cabeEnElHorario(
  rango: RangoDeTiempo,
  horario: HorarioDeOperacion,
  timeZone: string,
): Result<void, RechazoDeHorario> {
  const ventana = leerHorario(horario);

  if (!ventana.ok) {
    return ventana;
  }

  const inicio = minutosDelDia(rango.inicio, timeZone);
  const fin = minutosDelDia(rango.fin, timeZone);

  // Si el fin cae en un minuto del día anterior o igual al inicio, el rango cruzó la medianoche —o
  // dura más de 24 horas— y no hay ventana diaria que lo contenga. Se rechaza aquí en vez de
  // producir una comparación que da un resultado plausible y equivocado.
  if (fin <= inicio) {
    return err("no_cabe_en_un_dia");
  }

  if (inicio < ventana.value.apertura) {
    return err("antes_de_abrir");
  }

  if (fin > ventana.value.cierre) {
    return err("despues_de_cerrar");
  }

  return ok(undefined);
}

/**
 * `"06:00-18:00"` → minutos desde la medianoche.
 *
 * Se valida en vez de confiar: el valor viene de configuración, y una clave mal escrita a mano
 * —`"6-18"`, `"06:00 a 18:00"`— produciría `NaN` y comparaciones que **siempre dan falso**. El club
 * vería que no puede programar nada y no habría nada en pantalla que explique por qué.
 */
export function leerHorario(
  horario: HorarioDeOperacion,
): Result<{ apertura: number; cierre: number }, RechazoDeHorario> {
  const formato = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/u.exec(horario.trim());

  if (formato === null) {
    return err("horario_mal_escrito");
  }

  const [, horaApertura, minutoApertura, horaCierre, minutoCierre] = formato;
  const apertura = Number(horaApertura) * 60 + Number(minutoApertura);
  const cierre = Number(horaCierre) * 60 + Number(minutoCierre);

  if (apertura >= cierre || cierre > 24 * 60 || Number(minutoApertura) > 59 || Number(minutoCierre) > 59) {
    return err("horario_mal_escrito");
  }

  return ok({ apertura, cierre });
}

/**
 * A qué minuto del día corresponde un instante **en la zona del club**.
 *
 * Con `getHours()` daría la hora de la máquina donde corre el servidor, que en producción es UTC:
 * una práctica de las 4:00 p.m. en Bogotá se leería como las 9:00 p.m. y quedaría fuera del
 * horario sin que nada lo explique.
 */
function minutosDelDia(instante: Date, timeZone: string): number {
  const formato = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  // Se arma el objeto en vez de buscar con `find(...)?.value ?? "0"`: ese `??` cubre un caso que no
  // puede ocurrir —pedimos `hour` y `minute`, y el formateador los devuelve— y una rama que no se
  // puede ejecutar es una rama que nadie puede probar. Mismo patrón que `toLocalDate`.
  const partes = Object.fromEntries(
    formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );

  return Number(partes.hour) * 60 + Number(partes.minute);
}
