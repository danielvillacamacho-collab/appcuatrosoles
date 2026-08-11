import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ChangePasswordRequest } from "@polo/contracts";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import { AuthService } from "./auth.service.js";

/**
 * `POST /me/password` — cambiar la propia contraseña (T-037, `docs/03` §1).
 *
 * Controlador aparte y no un método más de `AuthController` por una razón de ruta: el prefijo de
 * aquél es `auth`, así que la operación habría quedado en `/auth/me/password` y `docs/03` la
 * documenta en `/me/password`, que es donde la va a buscar quien lea el documento. La lógica sigue
 * viviendo en `AuthService`, junto al login: **es una operación de credenciales**, comparte reglas
 * y consecuencias con él, no con editar el teléfono.
 */
@Controller("me")
@UseGuards(TenantGuard, SessionGuard)
export class MePasswordController {
  constructor(private readonly servicio: AuthService) {}

  @Post("password")
  @HttpCode(204)
  @SinPermiso("Cambiar la propia contraseña no exige permiso: es la cuenta de quien pide.")
  async cambiar(
    @Req() req: ConSessionUser,
    @Body(new ZodValidationPipe(ChangePasswordRequest)) cuerpo: ChangePasswordRequest,
  ): Promise<void> {
    const usuario = req.sessionUser;

    if (usuario === undefined) {
      throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
    }

    await this.servicio.cambiarContrasena(
      usuario.userAccountId,
      usuario.sessionId,
      cuerpo.currentPassword,
      cuerpo.newPassword,
    );
  }
}
