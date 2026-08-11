import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { SettingHistoryEntry, SettingResponse } from "@polo/contracts";
import {
  isSettingKey,
  resolveSetting,
  SETTING_CATALOG,
  validateSettingValue,
  type Clock,
  type ScopeKind,
  type SettingKey,
  type SettingValueRow,
} from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";

/** Desde dónde se pregunta o se fija: el ámbito y su identificador. */
export interface AmbitoDeConsulta {
  scope: ScopeKind;
  clubId: string | null;
  organizationId: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Todos los valores vigentes para un ámbito, con su origen.
   *
   * Se recorre **el catálogo**, no la tabla: así aparecen también las claves que nadie fijó nunca,
   * con su default. Una pantalla de configuración que sólo muestre lo que alguien tocó es una
   * pantalla en la que no se puede descubrir qué se puede configurar.
   */
  async listar(ambito: AmbitoDeConsulta, asOf?: Date): Promise<SettingResponse[]> {
    const filas = await this.filasRelevantes(ambito);
    const instante = asOf ?? this.clock.now();

    return (Object.keys(SETTING_CATALOG) as SettingKey[]).map((key) =>
      aRespuesta(resolveSetting(key, filas, contextoDe(ambito), instante)),
    );
  }

  async leer(ambito: AmbitoDeConsulta, key: string, asOf?: Date): Promise<SettingResponse> {
    if (!isSettingKey(key)) {
      throw new NotFoundException();
    }

    const filas = await this.filasRelevantes(ambito);

    return aRespuesta(
      resolveSetting(key, filas, contextoDe(ambito), asOf ?? this.clock.now()),
    );
  }

  /**
   * Fija un valor. **Nunca actualiza en sitio**: inserta una fila con su vigencia (R-020-08), y el
   * valor anterior queda consultable. Es lo que permite responder «cuánto costaba esto en marzo».
   */
  async fijar(
    ambito: AmbitoDeConsulta,
    key: string,
    valor: unknown,
    opciones: { effectiveFrom?: Date; actorUserId?: string },
  ): Promise<SettingResponse> {
    const validado = validateSettingValue(key, valor, ambito.scope);

    if (!validado.ok) {
      // 422 y no 400: el cuerpo cumple su esquema; lo que no cumple es el catálogo. El código dice
      // exactamente cuál de las cuatro cosas falló, para que la pantalla lo explique.
      throw new UnprocessableEntityException({ code: validado.error });
    }

    await this.prisma.setting.create({
      data: {
        scope: ambito.scope,
        scopeId: identificadorDe(ambito),
        key: validado.value.key,
        value: validado.value.value as Prisma.InputJsonValue,
        effectiveFrom: opciones.effectiveFrom ?? this.clock.now(),
        ...(opciones.actorUserId === undefined ? {} : { createdById: opciones.actorUserId }),
      },
    });

    return this.leer(ambito, validado.value.key);
  }

  /** El histórico de una clave en un ámbito, del más reciente al más viejo (HU-020-08). */
  async historial(ambito: AmbitoDeConsulta, key: string): Promise<SettingHistoryEntry[]> {
    if (!isSettingKey(key)) {
      throw new NotFoundException();
    }

    const filas = await this.prisma.setting.findMany({
      where: { scope: ambito.scope, scopeId: identificadorDe(ambito), key },
      orderBy: { effectiveFrom: "desc" },
    });

    return filas.map((fila) => ({
      value: fila.value,
      effectiveFrom: fila.effectiveFrom.toISOString(),
      createdAt: fila.createdAt.toISOString(),
    }));
  }

  /**
   * Trae **sólo** las filas que pueden ganar para este ámbito: las suyas, las de su club y las de
   * plataforma. No es una optimización cosmética — traer la tabla entera y filtrar en memoria haría
   * que la configuración de un club influyera en el trabajo que cuesta leer la de otro.
   */
  private async filasRelevantes(ambito: AmbitoDeConsulta): Promise<SettingValueRow[]> {
    const condiciones: Prisma.SettingWhereInput[] = [{ scope: "platform" }];

    if (ambito.clubId !== null) {
      condiciones.push({ scope: "club", scopeId: ambito.clubId });
    }

    if (ambito.organizationId !== null) {
      condiciones.push({ scope: "organization", scopeId: ambito.organizationId });
    }

    const filas = await this.prisma.setting.findMany({ where: { OR: condiciones } });

    return filas.map((fila) => ({
      key: fila.key,
      scope: fila.scope,
      scopeId: fila.scopeId,
      value: fila.value as number | boolean | string,
      effectiveFrom: fila.effectiveFrom,
    }));
  }
}

function contextoDe(ambito: AmbitoDeConsulta): { clubId: string | null; organizationId: string | null } {
  return { clubId: ambito.clubId, organizationId: ambito.organizationId };
}

function identificadorDe(ambito: AmbitoDeConsulta): string | null {
  if (ambito.scope === "platform") return null;

  return ambito.scope === "organization" ? ambito.organizationId : ambito.clubId;
}

function aRespuesta(resuelto: ReturnType<typeof resolveSetting>): SettingResponse {
  return {
    key: resuelto.key,
    value: resuelto.value,
    source: resuelto.source,
    scope: resuelto.scope,
    effectiveFrom: resuelto.effectiveFrom === null ? null : resuelto.effectiveFrom.toISOString(),
  };
}
