import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";

@Module({
  // La política de bloqueo por intentos fallidos es configuración (`docs/08` §9), no una
  // constante: el login la lee del servicio de ajustes.
  imports: [SettingsModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
  exports: [PasswordService],
})
export class AuthApiModule {}
