import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module.js";

/**
 * Los módulos de negocio (identity, practices, ...) se agregan aquí uno por uno, cada uno al
 * implementarse (specs/010, specs/020, ...). No se registra un módulo antes de que exista.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
