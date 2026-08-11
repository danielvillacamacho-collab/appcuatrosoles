import { Inject, Injectable } from "@nestjs/common";
import { BASE_DOMAIN } from "../tenant/base-domain.js";
import { ClubDirectory } from "../tenant/club-directory.js";

/**
 * La dirección pública de la aplicación web de un club — la que va en los enlaces de los correos.
 *
 * **Se arma con el slug del club, nunca con el `Host` de la solicitud.** Si saliera del `Host`, a
 * quien pide un restablecimiento desde un subdominio equivocado le llegaría un enlace a ese
 * subdominio, y con él una forma de que un club mande correos que apuntan a otro (P-05).
 *
 * Vivía copiada en tres controladores —invitación, restablecimiento y cambio de correo— y las tres
 * copias tenían el mismo error, que es lo que suele pasar con el código duplicado: **faltaba el
 * puerto**. En producción no se nota, porque `https` va por el 443 y no se escribe. En desarrollo,
 * el enlace del correo apuntaba a `club-demo.localhost` sin puerto y no llevaba a ninguna parte.
 * Lo destapó el E2E de navegador (T-128) abriendo el enlace tal como llega, que es justamente lo
 * que ningún test de API hacía.
 */
@Injectable()
export class UrlDelClub {
  constructor(
    private readonly clubes: ClubDirectory,
    @Inject(BASE_DOMAIN) private readonly baseDomain: string,
  ) {}

  async para(clubId: string): Promise<string> {
    const club = (await this.clubes.all()).find((candidato) => candidato.id === clubId);
    const esquema = esProduccion() ? "https" : "http";

    return `${esquema}://${club?.slug ?? ""}.${this.baseDomain}${puerto()}`;
  }
}

function esProduccion(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * El puerto de la aplicación web, sólo cuando no es el implícito del esquema.
 *
 * `WEB_PORT` existe para desarrollo, donde Vite sirve en el 5173 y el API en otro. En producción
 * no se define: la aplicación va detrás del proxy inverso de `docs/07` §4, en el 443, y agregarlo
 * produciría enlaces feos que además dejarían de funcionar el día que cambie la topología.
 */
function puerto(): string {
  const configurado = process.env.WEB_PORT?.trim() ?? "";

  return configurado === "" ? "" : `:${configurado}`;
}
