import { err, ok, type Result } from "../shared/result.js";
import { normalizeSlug, validateSlug } from "./slug.js";

/** Lo mínimo que el dominio necesita saber de un club para resolver el tenant. */
export interface ClubRef {
  id: string;
  slug: string;
  status: "active" | "suspended";
}

/**
 * Por qué no se pudo resolver.
 *
 * **Los cinco motivos son la misma respuesta para el cliente: `404`, idéntico** (R-020-02, P-12).
 * Distinguir «este club no existe» de «este club está suspendido» le confirmaría a un competidor
 * que cierto club es cliente nuestro. La distinción existe **sólo para el log**, y quien use esta
 * función tiene prohibido convertirla en mensajes distintos; el guard de T-221 los colapsa y hay
 * un test que compara las respuestas byte a byte.
 */
export type TenantRejection =
  | "host_invalido"
  | "sin_subdominio"
  | "subdominio_invalido"
  | "club_desconocido"
  | "club_suspendido";

/**
 * A qué club pertenece una solicitud, según el host por el que llegó (ADR-013, R-020-01).
 *
 * Es la función de la que depende el aislamiento entre clubes: si devuelve el club equivocado, todo
 * el resto del sistema —repositorios, guards, auditoría— trabaja con diligencia sobre el inquilino
 * equivocado. Por eso no adivina nada.
 *
 * **El dominio base entra como parámetro y no se deduce del host.** Sin él no se puede saber si
 * `polo.app` es un club llamado «polo» o el dominio de la instalación sin subdominio; y deducirlo
 * «tomando lo que está antes del primer punto» convierte el apex del sitio en un tenant. Es
 * configuración de la instalación (`docs/07`), no conocimiento del dominio.
 *
 * @param host el `Host` de la solicitud, tal como llega: puede traer puerto, mayúsculas o el punto
 *   final de un nombre absoluto.
 * @param baseDomain dominio de la instalación, p. ej. `polo.app` o `localhost` en desarrollo.
 * @param clubs los clubes contra los cuales resolver. Los provee el repositorio (con su caché).
 */
export function resolveTenant(
  host: string,
  baseDomain: string,
  clubs: readonly ClubRef[],
): Result<ClubRef, TenantRejection> {
  const anfitrion = limpiarHost(host);
  const base = limpiarHost(baseDomain);

  if (anfitrion.length === 0 || base.length === 0) {
    return err("host_invalido");
  }

  // El apex es el sitio de la instalación, no un club.
  if (anfitrion === base) {
    return err("sin_subdominio");
  }

  if (!anfitrion.endsWith(`.${base}`)) {
    // Un host que no pertenece a esta instalación. Puede ser un `Host` falsificado apuntando a
    // nuestro servidor: no se intenta interpretarlo, se rechaza.
    return err("host_invalido");
  }

  const subdominio = anfitrion.slice(0, anfitrion.length - base.length - 1);

  // `a.b.polo.app` no es el club `a`: un subdominio de más nivel no se recorta ni se ignora,
  // porque cualquiera de esas dos cosas serviría un club desde una dirección que no es la suya.
  const veredicto = validateSlug(subdominio);

  if (!veredicto.ok) {
    return err("subdominio_invalido");
  }

  const club = clubs.find((candidato) => normalizeSlug(candidato.slug) === veredicto.value);

  if (club === undefined) {
    return err("club_desconocido");
  }

  if (club.status !== "active") {
    return err("club_suspendido");
  }

  return ok(club);
}

/**
 * Deja el host comparable: sin espacios, en minúsculas, sin puerto y sin el punto final de un
 * nombre absoluto (`lospinos.polo.app.` es el mismo host que `lospinos.polo.app`, y quien lo
 * escriba así entraría al club sin que ninguna comparación de texto lo reconozca).
 */
function limpiarHost(valor: string): string {
  // Se quita el puerto con un reemplazo y no con `split(":")[0]`: eso último obliga a un
  // `?? ""` para el caso que TypeScript cree posible y que nunca ocurre, y una rama que no se
  // puede ejecutar es una rama que nadie puede probar.
  const sinPuerto = valor.trim().toLowerCase().replace(/:.*$/, "");

  return sinPuerto.replace(/\.$/, "");
}
