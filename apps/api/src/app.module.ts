import { Module } from "@nestjs/common";
import { ClockModule } from "./common/clock/clock.module.js";
import { PrismaModule } from "./common/prisma/prisma.module.js";
import { HealthModule } from "./health/health.module.js";

/**
 * Los módulos de negocio (identity, practices, ...) se agregan aquí uno por uno, cada uno al
 * implementarse (specs/010, specs/020, ...). No se registra un módulo antes de que exista.
 *
 * `PrismaModule` y `ClockModule` son transversales y globales: la conexión a la base y el reloj los
 * necesita casi todo, y ninguno de los dos es de un módulo de negocio en particular.
 */
@Module({
  imports: [PrismaModule, ClockModule, HealthModule],
})
export class AppModule {}
