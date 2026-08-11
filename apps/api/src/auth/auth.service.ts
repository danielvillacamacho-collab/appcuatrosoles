import { Inject, Injectable, HttpStatus } from "@nestjs/common";
import { ApiException } from "../common/errors/api-error.js";
import type { LoginResponse } from "@polo/contracts";
import { resolveLoginOutcome, type AccountStatus, type Clock } from "@polo/domain";
import type { UserAccountStatus } from "@prisma/client";
import { CLOCK } from "../common/clock/clock.module.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { crearTokenDeSesion, hashDeTokenDeSesion } from "../common/auth/session-token.js";
import { PasswordService } from "./password.service.js";

/**
 * Cuánto dura una sesión.
 *
 * **Decisión tomada aquí, no en `docs/08`**, y conviene saber por qué: la duración *absoluta* de
 * una sesión no estaba en el catálogo de configuración —el que sí está, y quedó «por definir», es
 * el cierre por **inactividad** (`auth.session_idle_timeout_hours`, hoy desactivado; ver T-212)—.
 * Se eligen dos valores fijos y se documentan:
 *
 * - **12 horas** sin «recordarme»: cubre una jornada de trabajo del administrador del club y
 *   obliga a volver a entrar al día siguiente. En un dispositivo compartido —la computadora de la
 *   secretaría, el celular que se pasa de mano— es lo que evita que la sesión quede viva sola.
 * - **30 días** con «recordarme»: es la sesión de quien entra desde su propio celular a ver si
 *   quedó cupo en la práctica del sábado. Pedirle contraseña cada vez es lo que hace que la gente
 *   deje de usar la plataforma y vuelva a WhatsApp, que es el problema que vinimos a resolver.
 *
 * Cuándo revisarlo: si el club pide otra cosa, pasa a ser configuración (P-04) con su clave en
 * `docs/08`. Hoy no hay nadie que lo haya pedido, y una clave que nadie usa es ruido (ver T-212).
 */
const DURACION_NORMAL_MS = 12 * 60 * 60 * 1000;
const DURACION_RECORDARME_MS = 30 * 24 * 60 * 60 * 1000;

export interface SesionCreada {
  token: string;
  expiraEn: Date;
  usuario: LoginResponse;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Inicio de sesión (HU-010-04).
   *
   * El orden —contraseña primero, estado después— lo decide `resolveLoginOutcome` en el dominio
   * (T-010) y no este servicio: con la comprobación suelta aquí, una reordenación bien
   * intencionada convertiría el login en un detector de correos registrados (P-12, R-010-07).
   *
   * **La respuesta es la misma cuando el correo no existe y cuando la contraseña no coincide**, y
   * también el trabajo: si no hay cuenta, igual se verifica una contraseña contra un hash
   * inservible. Sin eso, la diferencia de tiempo entre los dos casos —milisegundos contra el costo
   * de Argon2— diría qué correos tienen cuenta sin necesidad de leer ninguna respuesta.
   */
  async login(
    email: string,
    contrasena: string,
    rememberMe: boolean,
    clubId: string,
  ): Promise<SesionCreada> {
    const cuenta = await this.prisma.userAccount.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        person: { select: { id: true, fullName: true, clubId: true } },
        roleAssignments: {
          where: { revokedAt: null },
          select: { scope: true, scopeId: true },
        },
      },
    });

    const credentialsValid =
      cuenta === null
        ? await this.gastarElMismoTiempo(contrasena)
        : await this.passwords.verificar(cuenta.passwordHash, contrasena);

    const veredicto = resolveLoginOutcome({
      credentialsValid,
      status: cuenta === null ? "active" : aEstadoDeDominio(cuenta.status),
    });

    if (cuenta !== null && veredicto.allowed && !perteneceAlClub(cuenta, clubId)) {
      // **Una cuenta sólo inicia sesión en el club al que pertenece.**
      //
      // Lo encontró la prueba de aislamiento al registrar esta ruta: sin esto, cualquiera con
      // cuenta en un club podía entrar por el subdominio de otro. No obtendría permisos —sus roles
      // son de su club—, pero las rutas que sólo exigen sesión (el detalle del club, el listado de
      // organizaciones, de temporadas, de categorías) le habrían quedado abiertas. Es decir: un
      // club podía leer la estructura de otro con sólo tener una cuenta propia.
      //
      // La respuesta es la misma que para una contraseña incorrecta, a propósito: decir «tu cuenta
      // no es de este club» confirmaría que existe (P-12).
      throw credencialesInvalidas();
    }

    if (cuenta === null || !veredicto.allowed) {
      // Una sola excepción para todos los motivos, con su propio código y su propio mensaje. El
      // genérico del catálogo («Debes iniciar sesión para continuar») es correcto para una ruta
      // que exige sesión y desconcertante para quien acaba de escribir su contraseña.
      //
      // El motivo real —`invitation_pending`, `suspended`…— lo distinguirá T-033, y sólo con quien
      // ya demostró conocer su contraseña.
      throw credencialesInvalidas();
    }

    const token = crearTokenDeSesion();
    const ahora = this.clock.now();
    const expiraEn = new Date(
      ahora.getTime() + (rememberMe ? DURACION_RECORDARME_MS : DURACION_NORMAL_MS),
    );

    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          userAccountId: cuenta.id,
          tokenHash: hashDeTokenDeSesion(token),
          expiresAt: expiraEn,
          rememberMe,
        },
      }),
      this.prisma.userAccount.update({
        where: { id: cuenta.id },
        // Entrar bien **borra el contador de intentos fallidos**: si no, cuatro errores de tipeo
        // repartidos en un mes acabarían bloqueando a alguien que nunca falló dos veces seguidas.
        data: { lastLoginAt: ahora, failedAttempts: 0, lockedUntil: null },
      }),
    ]);

    return {
      token,
      expiraEn,
      usuario: {
        userAccountId: cuenta.id,
        personId: cuenta.person.id,
        fullName: cuenta.person.fullName,
        email: email.trim().toLowerCase(),
      },
    };
  }

  /**
   * Verifica la contraseña contra un hash real inservible, para que el tiempo de respuesta sea el
   * mismo exista o no la cuenta. El hash es de una contraseña aleatoria que nadie conoce.
   */
  private async gastarElMismoTiempo(contrasena: string): Promise<boolean> {
    return this.passwords.verificar(HASH_SEÑUELO, contrasena);
  }
}

/**
 * El único rechazo que se le puede mostrar a alguien que no demostró conocer la contraseña
 * (R-010-07, P-12). **Idéntico** para correo inexistente y para contraseña incorrecta: cualquier
 * diferencia —el mensaje, el código, el estado, una cabecera— convierte el login en un detector de
 * correos registrados.
 */
function credencialesInvalidas(): ApiException {
  return new ApiException(
    "CREDENTIALS_INVALID",
    HttpStatus.UNAUTHORIZED,
    "Correo o contraseña incorrectos.",
  );
}

/**
 * Hash de una contraseña aleatoria, generado una vez y fijo. Existe sólo para que el camino «no
 * hay cuenta» cueste lo mismo que el camino «hay cuenta»; nadie puede iniciar sesión con él porque
 * nadie conoce la contraseña que le corresponde.
 */
const HASH_SEÑUELO =
  "$argon2id$v=19$m=19456,t=2,p=1$c2VudWVsb1NpbkltcG9ydGFuY2lh$8dSCJVK9dOsK4vJfDPQXDrTGHQK7yzL1kLvJt5Uy5H0";

function aEstadoDeDominio(estado: UserAccountStatus): AccountStatus {
  return estado;
}

/**
 * ¿Esta cuenta tiene algo que hacer en este club?
 *
 * Tres formas de pertenecer, y ninguna es «tener cuenta»:
 * 1. Su persona es de este club — el caso normal.
 * 2. Tiene un rol con ámbito de club **en este club**: es nuestro personal de servicio operando
 *    aquí (`specs/140` HU-140-03).
 * 3. Es `superadmin`: manda en toda la plataforma por definición.
 *
 * Los roles de ámbito de organización no se evalúan aquí porque haría falta saber a qué club
 * pertenece cada organización, y eso es una consulta más en la ruta más caliente. Quien tenga un
 * rol de organización tiene además su persona en el club (caso 1); si algún día eso deja de ser
 * cierto, este comentario es el lugar donde mirar.
 */
function perteneceAlClub(
  cuenta: {
    person: { clubId: string };
    roleAssignments: { scope: "platform" | "club" | "organization"; scopeId: string | null }[];
  },
  clubId: string,
): boolean {
  if (cuenta.person.clubId === clubId) {
    return true;
  }

  return cuenta.roleAssignments.some(
    (rol) =>
      rol.scope === "platform" || (rol.scope === "club" && rol.scopeId === clubId),
  );
}
