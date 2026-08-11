import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import type { ConTenant } from "../tenant/tenant-context.js";
import {
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  ResetPasswordRequest,
} from "@polo/contracts";
import { COOKIE_CSRF, tokenCsrfParaSesion } from "../common/auth/csrf.js";
import { SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { COOKIE_DE_SESION } from "../common/auth/session-token.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { UrlDelClub } from "../club/url-del-club.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import { AuthService } from "./auth.service.js";
import { PasswordResetService } from "./password-reset.service.js";

@Controller("auth")
@UseGuards(TenantGuard)
export class AuthController {
  constructor(
    private readonly servicio: AuthService,
    private readonly restablecimiento: PasswordResetService,
    private readonly urlDelClub: UrlDelClub,
  ) {}

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
  @SinPermiso("Iniciar sesión es lo que uno hace antes de tener autoridad: no hay permiso que exigir.")
  async login(
    @Body(new ZodValidationPipe(LoginRequest)) cuerpo: LoginRequest,
    @Req() req: ConTenant & Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const sesion = await this.servicio.login(
      cuerpo.email,
      cuerpo.password,
      cuerpo.rememberMe,
      // El club del subdominio: una cuenta sólo inicia sesión donde tiene algo que hacer.
      clubDeLaSolicitud(req),
      req.headers["user-agent"],
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

  /**
   * `POST /auth/logout` — cierra **esta** sesión (T-034, R-010-09).
   *
   * Revoca la fila, no borra: `revoked_at` deja constancia de cuándo se cerró, que es lo que
   * permite responder «¿desde cuándo no entra esta persona?» sin adivinar. Y borra las dos cookies,
   * porque dejarlas puestas haría que el navegador siguiera mandando una credencial muerta en cada
   * solicitud.
   */
  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @SinPermiso("Cerrar la sesión propia no exige permiso: es la sesión de quien pide.")
  async logout(@Req() req: ConSessionUser, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.servicio.cerrarSesion(sesionDeLaSolicitud(req));

    this.borrarCookies(res);
  }

  /**
   * `POST /auth/logout-all` — cierra **todas** las sesiones de la cuenta.
   *
   * Es lo que usa alguien que sospecha que dejó la sesión abierta en un dispositivo ajeno. Incluye
   * la actual: media desconexión no tranquiliza a nadie.
   */
  @Post("logout-all")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @SinPermiso("Cerrar las sesiones propias no exige permiso: son las de quien pide.")
  async logoutAll(
    @Req() req: ConSessionUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.servicio.cerrarTodasLasSesiones(usuarioDeLaSolicitud(req).userAccountId);

    this.borrarCookies(res);
  }

  /**
   * `POST /auth/password/forgot` (T-035, HU-010-06).
   *
   * **Siempre responde lo mismo**, exista o no la cuenta: «si el correo está registrado, te
   * enviamos un enlace» (R-010-07). Es la contracara del login — si aquí dijéramos «ese correo no
   * existe», daría igual todo el cuidado que se puso allá.
   */
  @Post("password/forgot")
  @HttpCode(202)
  @SinPermiso("Pedir un restablecimiento es lo que hace quien no puede entrar: no hay permiso posible.")
  async olvide(
    @Body(new ZodValidationPipe(ForgotPasswordRequest)) cuerpo: ForgotPasswordRequest,
    @Req() req: ConTenant,
  ): Promise<{ mensaje: string }> {
    await this.restablecimiento.pedir(
      cuerpo.email,
      clubDeLaSolicitud(req),
      await this.urlDelClub.para(clubDeLaSolicitud(req)),
    );

    return {
      mensaje: "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.",
    };
  }

  /** `POST /auth/password/reset` (T-036, R-010-09). */
  @Post("password/reset")
  @HttpCode(204)
  @SinPermiso("Restablecer con un enlace de un solo uso es el camino de quien no tiene sesión.")
  async restablecer(
    @Body(new ZodValidationPipe(ResetPasswordRequest)) cuerpo: ResetPasswordRequest,
  ): Promise<void> {
    await this.restablecimiento.restablecer(cuerpo.token, cuerpo.newPassword);
  }


  private borrarCookies(res: Response): void {
    for (const nombre of [COOKIE_DE_SESION, COOKIE_CSRF]) {
      res.clearCookie(nombre, { path: "/" });
    }
  }
}

/**
 * `Secure` exige HTTPS, y el desarrollo local corre en `http://`. Se activa por entorno en vez de
 * dejarlo siempre encendido —que rompería el desarrollo— o siempre apagado, que sería peor.
 */
function esProduccion(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * El usuario de la sesión, o un error de programación si el guard no corrió. Mismo criterio que
 * `clubDeLaSolicitud`: la aserción no-nula está prohibida en el repo, y con razón.
 */
function usuarioDeLaSolicitud(req: ConSessionUser): { userAccountId: string; sessionId: string } {
  const usuario = req.sessionUser;

  if (usuario === undefined) {
    throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
  }

  return usuario;
}

function sesionDeLaSolicitud(req: ConSessionUser): string {
  return usuarioDeLaSolicitud(req).sessionId;
}
