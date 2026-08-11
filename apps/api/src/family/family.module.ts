import { Global, Module } from "@nestjs/common";
import { GuardianshipsController, WaiversController } from "./family.controller.js";
import { GuardianshipsService } from "./guardianships.service.js";
import { WaiversService } from "./waivers.service.js";

/**
 * Global por `WaiversService`: es el ayudante que T-075 pide que reutilicen prácticas y clases sin
 * reimplementar la regla del waiver. Que sea global evita que cada módulo futuro tenga que
 * importarlo — y que alguien, para no hacerlo, escriba la comprobación por su cuenta.
 */
@Global()
@Module({
  controllers: [GuardianshipsController, WaiversController],
  providers: [GuardianshipsService, WaiversService],
  exports: [WaiversService, GuardianshipsService],
})
export class FamilyModule {}
