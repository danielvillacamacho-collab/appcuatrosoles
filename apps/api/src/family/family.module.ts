import { Global, Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module.js";
import {
  GuardianshipsController,
  MinorsController,
  WaiversController,
} from "./family.controller.js";
import { GuardianshipsService } from "./guardianships.service.js";
import { WaiversService } from "./waivers.service.js";

/**
 * Global por `WaiversService`: es el ayudante que T-075 pide que reutilicen prácticas y clases sin
 * reimplementar la regla del waiver. Que sea global evita que cada módulo futuro tenga que
 * importarlo — y que alguien, para no hacerlo, escriba la comprobación por su cuenta.
 */
@Global()
@Module({
  // `SettingsService` para el límite de edad del perfil de menor (T-076): el club lo define, y
  // leerlo aquí es lo que evita que 18 quede escrito en el código (P-04).
  imports: [SettingsModule],
  controllers: [GuardianshipsController, MinorsController, WaiversController],
  providers: [GuardianshipsService, WaiversService],
  exports: [WaiversService, GuardianshipsService],
})
export class FamilyModule {}
