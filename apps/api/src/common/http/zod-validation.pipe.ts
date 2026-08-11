import { Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Valida el cuerpo de la solicitud contra su esquema de `packages/contracts` (`docs/03` §4).
 *
 * Se usa por parámetro, con el esquema explícito:
 *
 * ```ts
 * crear(@Body(new ZodValidationPipe(CreateClubRequest)) cuerpo: CreateClubRequest) { ... }
 * ```
 *
 * **No atrapa el error**: deja que el `ZodError` suba al filtro global (T-024), que ya sabe
 * convertirlo en un `400` con el detalle de qué campos fallaron. Atraparlo aquí para relanzarlo
 * como otra cosa significaría dos formas de responder lo mismo, y tarde o temprano se separan.
 *
 * Devuelve el valor **parseado**, no el original: es lo que aplica los `default` del esquema y
 * descarta los campos que el contrato no declara — un cliente no puede colar propiedades extra
 * hasta el servicio.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodType<T>) {}

  transform(valor: unknown): T {
    return this.esquema.parse(valor);
  }
}
