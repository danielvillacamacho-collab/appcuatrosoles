import { Module } from "@nestjs/common";
import { AuditModule } from "./common/audit/audit.module.js";
import { AuthModule } from "./common/auth/auth.module.js";
import { ClockModule } from "./common/clock/clock.module.js";
import { PrismaModule } from "./common/prisma/prisma.module.js";
import { AuthApiModule } from "./auth/auth.module.js";
import { ClubModule } from "./club/club.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { TenantModule } from "./tenant/tenant.module.js";
import { HealthModule } from "./health/health.module.js";

/**
 * Los módulos de negocio (identity, practices, ...) se agregan aquí uno por uno, cada uno al
 * implementarse (specs/010, specs/020, ...). No se registra un módulo antes de que exista.
 *
 * `PrismaModule`, `ClockModule` y `AuthModule` son transversales y globales: la conexión a la base,
 * el reloj, los guards y la auditoría los necesita casi todo, y ninguno es de un módulo de negocio en particular.
 * `AuthModule` trae además la comprobación que impide arrancar si una ruta mutante no declara su
 * permiso (`ADR-014` punto 4) — por eso importa al `AppModule` y no sólo a quien use los guards.
 */
@Module({
  imports: [PrismaModule, ClockModule, TenantModule, AuthModule, AuditModule, PlatformModule, ClubModule, SettingsModule, AuthApiModule, HealthModule],
})
export class AppModule {}
