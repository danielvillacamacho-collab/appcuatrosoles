import { Module } from "@nestjs/common";
import { AuthApiModule } from "../auth/auth.module.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";

@Module({
  // `PasswordService` vive en el módulo de autenticación: cambiar el correo de acceso exige la
  // contraseña, y verificarla es de allá.
  imports: [AuthApiModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
