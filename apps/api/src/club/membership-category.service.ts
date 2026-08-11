import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreateMembershipCategoryRequest,
  MembershipCategoryResponse,
  UpdateMembershipCategoryRequest,
} from "@polo/contracts";
import { PrismaService } from "../common/prisma/prisma.service.js";

@Injectable()
export class MembershipCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(clubId: string): Promise<MembershipCategoryResponse[]> {
    const filas = await this.prisma.membershipCategory.findMany({
      where: { clubId },
      orderBy: { name: "asc" },
    });

    return filas.map(aRespuesta);
  }

  async crear(
    clubId: string,
    datos: CreateMembershipCategoryRequest,
  ): Promise<MembershipCategoryResponse> {
    try {
      const creada = await this.prisma.membershipCategory.create({
        data: {
          clubId,
          code: datos.code,
          name: datos.name,
          // El contrato trae un entero de centavos (P-02) y aquí se convierte a `BigInt`, que es
          // como se persiste. En ningún punto del camino hay un decimal.
          monthlyFeeCents: BigInt(datos.monthlyFeeCents),
          rights: datos.rights as Prisma.InputJsonValue,
        },
      });

      return aRespuesta(creada);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({ code: "codigo_en_uso" });
      }

      throw error;
    }
  }

  /**
   * Cambiar la cuota **no toca lo ya cobrado**: `monthly_fee_cents` es el valor vigente, y los
   * importes emitidos quedan congelados en su propio cobro (`docs/02` §A). Cuando exista el módulo
   * de pagos, esa separación es la que permite subir la cuota sin reescribir el pasado.
   */
  async actualizar(
    clubId: string,
    id: string,
    cambios: UpdateMembershipCategoryRequest,
  ): Promise<MembershipCategoryResponse> {
    await this.exigirQueSeaDelClub(clubId, id);

    const actualizada = await this.prisma.membershipCategory.update({
      where: { id },
      data: {
        ...(cambios.name === undefined ? {} : { name: cambios.name }),
        ...(cambios.monthlyFeeCents === undefined
          ? {}
          : { monthlyFeeCents: BigInt(cambios.monthlyFeeCents) }),
        ...(cambios.rights === undefined ? {} : { rights: cambios.rights as Prisma.InputJsonValue }),
        ...(cambios.active === undefined ? {} : { active: cambios.active }),
      },
    });

    return aRespuesta(actualizada);
  }

  private async exigirQueSeaDelClub(clubId: string, id: string): Promise<void> {
    const existe = await this.prisma.membershipCategory.findFirst({
      where: { id, clubId },
      select: { id: true },
    });

    if (existe === null) {
      throw new NotFoundException();
    }
  }
}

function aRespuesta(fila: {
  id: string;
  code: string;
  name: string;
  monthlyFeeCents: bigint;
  rights: Prisma.JsonValue;
  active: boolean;
}): MembershipCategoryResponse {
  return {
    id: fila.id,
    code: fila.code,
    name: fila.name,
    // `Number` sobre centavos es seguro: el entero seguro de JavaScript llega a 9·10¹⁵, que en
    // pesos colombianos son noventa billones. Lo que nunca se hace es tratarlos como decimales.
    monthlyFeeCents: Number(fila.monthlyFeeCents),
    rights: (fila.rights ?? {}) as Record<string, unknown>,
    active: fila.active,
  };
}
