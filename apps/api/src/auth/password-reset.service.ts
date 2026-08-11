import { Inject, Injectable, HttpStatus } from "@nestjs/common";
import { isOneTimeLinkValid, validatePassword, type Clock } from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { ApiException } from "../common/errors/api-error.js";
import { OutboxRepository } from "../common/outbox/outbox.repository.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { crearTokenDeSesion, hashDeTokenDeSesion } from "../common/auth/session-token.js";
import { SettingsService } from "../settings/settings.service.js";
import { MENSAJES_DE_POLITICA } from "./auth.service.js";
import { PasswordService } from "./password.service.js";

/** Una hora, el default de `auth.password_reset_link_validity_hours` (`docs/08` §9). */
const UNA_HORA_MS = 60 * 60 * 1000;

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly outbox: OutboxRepository,
    private readonly settings: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Pide un restablecimiento (T-035, HU-010-06).
   *
   * **Responde lo mismo exista o no la cuenta** (R-010-07): «si el correo está registrado, te
   * enviamos un enlace». Es la contracara del login — si aquí dijéramos «ese correo no existe»,
   * daría igual cuánto cuidado pusimos allá.
   *
   * El token y el correo se crean **en la misma transacción** (P-11): un enlace guardado cuyo
   * correo nunca sale deja a alguien esperando, y un correo enviado sin token guardado lo manda a
   * un enlace que no funciona.
   */
  async pedir(email: string, clubId: string, baseUrl: string): Promise<void> {
    const cuenta = await this.prisma.userAccount.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, status: true, person: { select: { fullName: true, clubId: true } } },
    });

    // Se exige además que la cuenta sea del club del subdominio, por la misma razón que el login
    // (T-030): si no, pedir restablecimientos desde el subdominio propio serviría para averiguar
    // qué correos tienen cuenta en otros clubes.
    if (cuenta === null || cuenta.person.clubId !== clubId || cuenta.status !== "active") {
      return;
    }

    const token = crearTokenDeSesion();

    await this.prisma.$transaction(async (tx) => {
      await tx.oneTimeToken.create({
        data: {
          userAccountId: cuenta.id,
          type: "password_reset",
          tokenHash: hashDeTokenDeSesion(token),
          sentAt: this.clock.now(),
        },
      });

      await this.outbox.encolar(tx, {
        tipo: "identity.send-password-reset",
        clubId,
        payload: {
          email: email.trim().toLowerCase(),
          fullName: cuenta.person.fullName,
          link: `${baseUrl}/reset-password?token=${token}`,
        },
      });
    });
  }

  /**
   * Usa el enlace (T-036, R-010-09).
   *
   * Tres cosas pasan juntas, en una transacción: la contraseña cambia, el enlace queda usado y
   * **se revocan todas las sesiones** de la cuenta. La tercera es la que importa: si alguien entró
   * con credenciales robadas, restablecer la contraseña es lo que lo saca — dejarle la sesión viva
   * convierte el gesto en nada.
   */
  async restablecer(token: string, nueva: string): Promise<void> {
    const fila = await this.prisma.oneTimeToken.findUnique({
      where: { tokenHash: hashDeTokenDeSesion(token) },
      select: {
        id: true,
        sentAt: true,
        usedAt: true,
        type: true,
        userAccount: { select: { id: true, email: true } },
      },
    });

    const validez = await this.ventanaDeValidez();

    if (
      fila === null ||
      fila.type !== "password_reset" ||
      !isOneTimeLinkValid({ sentAt: fila.sentAt, usedAt: fila.usedAt }, validez, this.clock).ok
    ) {
      // Un solo mensaje para «no existe», «ya se usó» y «venció». Distinguirlos le diría a quien
      // prueba tokens cuáles existieron alguna vez; y para quien tiene el enlace de su correo, la
      // salida es la misma en los tres casos: pedir uno nuevo.
      throw new ApiException(
        "RESET_LINK_INVALID",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Este enlace ya no sirve. Pide uno nuevo desde «Olvidé mi contraseña».",
      );
    }

    const politica = validatePassword(nueva, fila.userAccount.email);

    if (!politica.ok) {
      throw new ApiException(
        "PASSWORD_POLICY",
        HttpStatus.UNPROCESSABLE_ENTITY,
        MENSAJES_DE_POLITICA[politica.error],
      );
    }

    const hash = await this.passwords.hash(nueva);
    const ahora = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: fila.userAccount.id },
        // El bloqueo por intentos fallidos también se levanta: quien acaba de demostrar que
        // controla su correo no debería quedar esperando quince minutos por sus propios errores.
        data: { passwordHash: hash, failedAttempts: 0, lockedUntil: null },
      });
      await tx.oneTimeToken.update({ where: { id: fila.id }, data: { usedAt: ahora } });
      await tx.session.updateMany({
        where: { userAccountId: fila.userAccount.id, revokedAt: null },
        data: { revokedAt: ahora },
      });
      await this.outbox.encolar(tx, {
        tipo: "identity.notify-password-changed",
        payload: { email: fila.userAccount.email },
      });
    });
  }

  private async ventanaDeValidez(): Promise<number> {
    const resuelto = await this.settings.leer(
      { scope: "platform", clubId: null, organizationId: null },
      "auth.password_reset_link_validity_hours",
    );

    return typeof resuelto.value === "number" ? resuelto.value * UNA_HORA_MS : UNA_HORA_MS;
  }
}
