import { Global, Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { PermissionGuard } from "./permission.guard.js";
import { PermissionsDeclaredService } from "./permissions-declared.service.js";
import { SessionGuard } from "./session.guard.js";

/**
 * Los guards transversales y la comprobación de arranque que exige que toda ruta mutante declare
 * su permiso.
 *
 * Global, como `PrismaModule` y `ClockModule`: `@UseGuards(SessionGuard)` en un controlador de
 * cualquier módulo tiene que poder resolver sus dependencias sin que ese módulo importe nada.
 *
 * `DiscoveryModule` es lo que da acceso a la lista de controladores registrados — es así como
 * `PermissionsDeclaredService` puede revisarlos todos al arrancar.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [SessionGuard, PermissionGuard, PermissionsDeclaredService],
  exports: [SessionGuard, PermissionGuard],
})
export class AuthModule {}
