import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { ConTenant } from "../tenant/tenant-context.js";
import { LoginRequest, LoginResponse } from "@polo/contracts";
import { COOKIE_CSRF, tokenCsrfParaSesion } from "../common/auth/csrf.js";
import { RutaPublica } from "../common/auth/require-permission.js";
import { COOKIE_DE_SESION } from "../common/auth/session-token.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
@UseGuards(TenantGuard)
export class AuthController {
  constructor(private readonly servicio: AuthService) {}

  /**
   * `POST /auth/login` (HU-010-04, T-030).
   *
   * **No lleva `@RequirePermission`, y es la excepción que confirma la regla**: la comprobación de
   * arranque (T-022) exige que toda ruta mutante declare un permiso, y ésta no puede tener ninguno
   * porque es la que uno usa *antes* de tener autoridad. Se declara con el permiso vacío explícito
   * más abajo — no se le hace un hueco a la comprobación.
   *
   * Devuelve `200` y no `201`: no crea un recurso que el cliente vaya a referenciar; abre una
   * sesión (`docs/03` §3).
   */
  @Post("login")
  @HttpCode(200)
  @RutaPublica("Iniciar sesión es lo que uno hace antes de tener autoridad: no hay permiso que exigir.")
  async login(
    @Body(new ZodValidationPipe(LoginRequest)) cuerpo: LoginRequest,
    @Req() req: ConTenant,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const sesion = await this.servicio.login(
      cuerpo.email,
      cuerpo.password,
      cuerpo.rememberMe,
      // El club del subdominio: una cuenta sólo inicia sesión donde tiene algo que hacer.
      clubDeLaSolicitud(req),
    );

    // La cookie de sesión: `httpOnly` para que ningún script pueda leerla —ni el nuestro ni uno
    // inyectado—, y **sin atributo `Domain`**, que es la mitad silenciosa de la defensa CSRF: sin
    // él la cookie es de este host y sólo de este host, así que el subdominio de otro club no la
    // recibe (T-025, `docs/06` §1).
    res.cookie(COOKIE_DE_SESION, sesion.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: esProduccion(),
      path: "/",
      expires: sesion.expiraEn,
    });

    // La de CSRF es lo contrario: **legible por JavaScript a propósito**, porque el frontend tiene
    // que leerla para devolverla en la cabecera. No es un secreto que proteger sino una prueba de
    // que quien pide es nuestra propia página; el secreto sigue siendo la de arriba.
    res.cookie(COOKIE_CSRF, tokenCsrfParaSesion(sesion.token), {
      httpOnly: false,
      sameSite: "lax",
      secure: esProduccion(),
      path: "/",
      expires: sesion.expiraEn,
    });

    return sesion.usuario;
  }
}

/**
 * `Secure` exige HTTPS, y el desarrollo local corre en `http://`. Se activa por entorno en vez de
 * dejarlo siempre encendido —que rompería el desarrollo— o siempre apagado, que sería peor.
 */
function esProduccion(): boolean {
  return process.env.NODE_ENV === "production";
}
