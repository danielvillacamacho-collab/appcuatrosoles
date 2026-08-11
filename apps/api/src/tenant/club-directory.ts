import { Inject, Injectable } from "@nestjs/common";
import type { Clock, ClubRef } from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { ClubRepository } from "./club.repository.js";

/**
 * Cuánto vive la lista en memoria. `docs/06` §1 fija 60 segundos, y no hay Redis (ADR-012): la
 * caché es del proceso, así que dos procesos pueden tener versiones distintas durante ese lapso.
 */
const VIDA_UTIL_MS = 60_000;

/**
 * La lista de clubes en memoria, para no consultar la base en cada solicitud.
 *
 * Cada petición necesita saber a qué club pertenece **antes** de hacer nada más, así que sin caché
 * el sistema haría una consulta extra por cada una de ellas — incluidas las que terminan en `404`,
 * que es justamente el tráfico que uno no quiere pagar.
 *
 * **La invalidación explícita no es una optimización, es parte de una regla.** R-020-04 dice que
 * suspender un club corta el acceso *de inmediato*; con sólo TTL, «de inmediato» sería «dentro de
 * un minuto», y ese minuto es exactamente el que le queda a alguien a quien se le acaba de cortar
 * el contrato. Quien suspende, invalida (T-231). Es el mismo compromiso que quedó anotado para la
 * caché de sesiones en T-021.
 */
@Injectable()
export class ClubDirectory {
  private cache: { clubs: readonly ClubRef[]; vencaEn: number } | null = null;

  /**
   * La carga en curso, si la hay. Sin esto, veinte solicitudes simultáneas con la caché fría
   * disparan veinte consultas idénticas — el arranque de un proceso es exactamente ese momento.
   */
  private cargaEnCurso: Promise<readonly ClubRef[]> | null = null;

  constructor(
    private readonly repositorio: ClubRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async all(): Promise<readonly ClubRef[]> {
    const ahora = this.clock.now().getTime();

    if (this.cache !== null && ahora < this.cache.vencaEn) {
      return this.cache.clubs;
    }

    this.cargaEnCurso ??= this.cargar(ahora);

    return this.cargaEnCurso;
  }

  /**
   * Olvida lo que sabía. La próxima consulta vuelve a la base.
   *
   * Es lo que convierte «suspendí el club» en «el club ya no entra», sin esperar al TTL.
   */
  invalidate(): void {
    this.cache = null;
    this.cargaEnCurso = null;
  }

  private async cargar(ahora: number): Promise<readonly ClubRef[]> {
    try {
      const clubs = await this.repositorio.findAll();

      this.cache = { clubs, vencaEn: ahora + VIDA_UTIL_MS };

      return clubs;
    } catch (error) {
      // **No se sirve la copia vieja cuando la base falla.** Es tentador —mantendría el sitio en
      // pie— pero la copia vieja puede contener un club que acaba de ser suspendido, y servirlo es
      // el único error que este componente no puede cometer. Falla la solicitud, no el aislamiento.
      this.cache = null;

      throw error;
    } finally {
      this.cargaEnCurso = null;
    }
  }
}
