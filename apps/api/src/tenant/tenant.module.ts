import { Global, Module } from "@nestjs/common";
import { ClubDirectory } from "./club-directory.js";
import { ClubRepository } from "./club.repository.js";

/**
 * La resolución del tenant. Global, como el resto de lo transversal: el club de la solicitud lo
 * necesita casi todo, empezando por `PermissionGuard` y `AuditInterceptor`, que ya lo esperan.
 */
@Global()
@Module({
  providers: [ClubRepository, ClubDirectory],
  exports: [ClubRepository, ClubDirectory],
})
export class TenantModule {}
