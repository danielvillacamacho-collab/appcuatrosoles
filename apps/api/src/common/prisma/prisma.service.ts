import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * El cliente de Prisma como servicio de NestJS, con su ciclo de vida atado al de la aplicación.
 *
 * Conectar en `onModuleInit` en vez de dejar que Prisma conecte sola en la primera consulta hace
 * que un problema de base de datos aparezca **al arrancar** y no en la primera solicitud de un
 * usuario: en un despliegue, un proceso que no puede hablar con Postgres debe fallar de una vez,
 * no quedarse escuchando y devolver `500` (docs/07 §8).
 *
 * Ningún módulo de negocio debe usar este cliente directamente para consultar tablas de negocio:
 * el filtro por `club_id` va en la capa de repositorio (P-05), y un `prisma.person.findMany()`
 * suelto en un servicio es exactamente el bug que ese principio existe para evitar.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
