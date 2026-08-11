import { Global, Module } from "@nestjs/common";
import { AuditInterceptor } from "./audit.interceptor.js";

/**
 * Global por la misma razón que `AuthModule`: `@UseInterceptors(AuditInterceptor)` en un
 * controlador de cualquier módulo tiene que resolver sus dependencias sin que ese módulo importe
 * nada.
 */
@Global()
@Module({
  providers: [AuditInterceptor],
  exports: [AuditInterceptor],
})
export class AuditModule {}
