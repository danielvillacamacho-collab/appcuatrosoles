import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

/**
 * Global a propósito: la conexión a Postgres es una sola por proceso y la necesitan casi todos los
 * módulos. Declararlo global evita que cada módulo nuevo tenga que acordarse de importarlo —y que
 * el olvido se manifieste como un error de inyección en tiempo de arranque en vez de al escribirlo.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
