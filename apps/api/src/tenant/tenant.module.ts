import { Global, Module } from "@nestjs/common";
import { BASE_DOMAIN, baseDomainDelEntorno } from "./base-domain.js";
import { ClubDirectory } from "./club-directory.js";
import { ClubRepository } from "./club.repository.js";
import { TenantGuard } from "./tenant.guard.js";

/**
 * La resolución del tenant. Global, como el resto de lo transversal: el club de la solicitud lo
 * necesita casi todo, empezando por `PermissionGuard` y `AuditInterceptor`, que ya lo esperan.
 */
@Global()
@Module({
  providers: [
    ClubRepository,
    ClubDirectory,
    TenantGuard,
    { provide: BASE_DOMAIN, useFactory: baseDomainDelEntorno },
  ],
  exports: [ClubRepository, ClubDirectory, TenantGuard, BASE_DOMAIN],
})
export class TenantModule {}
