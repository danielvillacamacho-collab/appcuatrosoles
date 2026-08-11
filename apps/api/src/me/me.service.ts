import { Inject, Injectable, NotFoundException, HttpStatus } from "@nestjs/common";
import type {
  MeResponse,
  NotificationPreferenceResponse,
  SessionResponse,
  UpdateMeRequest,
} from "@polo/contracts";
import {
  NOTIFICATION_TYPES,
  esAvisoInevitable,
  isOneTimeLinkValid,
  type Clock,
} from "@polo/domain";
import { CLOCK } from "../common/clock/clock.module.js";
import { ApiException } from "../common/errors/api-error.js";
import { OutboxRepository } from "../common/outbox/outbox.repository.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { crearTokenDeSesion, hashDeTokenDeSesion } from "../common/auth/session-token.js";
import { PasswordService } from "../auth/password.service.js";

/** El enlace de confirmación de correo dura un día: no es urgente, pero tampoco eterno. */
const UN_DIA_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly outbox: OutboxRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * El perfil propio (T-040).
   *
   * Se arma campo por campo, no con un `select` amplio: **todo lo que se agregue aquí es algo que
   * la persona ve de sí misma**, y hay datos —notas internas, quién la creó, su estado— que son
   * *sobre* ella pero no *para* ella.
   */
  async perfil(userAccountId: string, clubId: string): Promise<MeResponse> {
    const cuenta = await this.prisma.userAccount.findUnique({
      where: { id: userAccountId },
      select: {
        id: true,
        email: true,
        pendingEmail: true,
        person: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            photoKey: true,
            organizations: {
              where: { leftOn: null },
              select: { organizationId: true, relationship: true },
            },
            membershipHistory: {
              where: { effectiveTo: null },
              select: { category: { select: { code: true, name: true } } },
              take: 1,
            },
          },
        },
        roleAssignments: {
          where: { revokedAt: null },
          select: { role: true, scope: true, scopeId: true },
        },
      },
    });

    if (cuenta === null) {
      throw new NotFoundException();
    }

    // Los nombres de las organizaciones se resuelven **acotados al club de la solicitud**: es la
    // misma persona vista desde su club, no un consolidado de todos.
    const organizaciones = await this.prisma.organization.findMany({
      where: {
        clubId,
        id: { in: cuenta.person.organizations.map((vinculo) => vinculo.organizationId) },
      },
      select: { id: true, name: true },
    });

    const categoria = cuenta.person.membershipHistory[0]?.category ?? null;

    return {
      userAccountId: cuenta.id,
      personId: cuenta.person.id,
      fullName: cuenta.person.fullName,
      email: cuenta.email,
      pendingEmail: cuenta.pendingEmail,
      phone: cuenta.person.phone,
      photoKey: cuenta.person.photoKey,
      roles: cuenta.roleAssignments,
      organizations: organizaciones.map((organizacion) => ({
        id: organizacion.id,
        name: organizacion.name,
        relationship:
          cuenta.person.organizations.find((v) => v.organizationId === organizacion.id)
            ?.relationship ?? "",
      })),
      membershipCategory: categoria,
    };
  }

  /** Editar el perfil propio (T-041). Sólo los campos del contrato llegan hasta aquí. */
  async actualizar(
    userAccountId: string,
    clubId: string,
    cambios: UpdateMeRequest,
  ): Promise<MeResponse> {
    const cuenta = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: userAccountId },
      select: { personId: true },
    });

    await this.prisma.person.update({
      where: { id: cuenta.personId },
      data: {
        ...(cambios.phone === undefined ? {} : { phone: cambios.phone }),
        ...(cambios.photoKey === undefined ? {} : { photoKey: cambios.photoKey }),
      },
    });

    return this.perfil(userAccountId, clubId);
  }

  /**
   * Pedir el cambio del correo de acceso (T-042, HU-010-07).
   *
   * **El correo anterior sigue valiendo hasta que se confirme el nuevo.** Si se cambiara de una y
   * la confirmación no llegara —dedo, buzón lleno, dirección mal escrita— la persona quedaría sin
   * poder entrar y sin forma de recuperarlo: el restablecimiento iría a la dirección equivocada.
   *
   * Se exige la contraseña actual: cambiar el correo de acceso es cambiar la llave de la cuenta, y
   * una sesión abierta en un dispositivo prestado no debería alcanzar.
   */
  async pedirCambioDeCorreo(
    userAccountId: string,
    clubId: string,
    nuevoCorreo: string,
    contrasenaActual: string,
    baseUrl: string,
  ): Promise<void> {
    const cuenta = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: userAccountId },
      select: { passwordHash: true, person: { select: { fullName: true } } },
    });

    if (!(await this.passwords.verificar(cuenta.passwordHash, contrasenaActual))) {
      throw new ApiException(
        "CREDENTIALS_INVALID",
        HttpStatus.UNAUTHORIZED,
        "Correo o contraseña incorrectos.",
      );
    }

    const correo = nuevoCorreo.trim().toLowerCase();
    const yaEnUso = await this.prisma.userAccount.findUnique({ where: { email: correo } });

    if (yaEnUso !== null) {
      // Aquí sí se dice que está en uso, y es distinto del login: quien pregunta ya demostró ser
      // el titular de esta cuenta, y sin el aviso quedaría esperando una confirmación que no va a
      // llegar nunca.
      throw new ApiException(
        "EMAIL_IN_USE",
        HttpStatus.CONFLICT,
        "Ese correo ya está en uso por otra cuenta.",
      );
    }

    const token = crearTokenDeSesion();

    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({ where: { id: userAccountId }, data: { pendingEmail: correo } });
      await tx.oneTimeToken.create({
        data: {
          userAccountId,
          type: "email_change",
          tokenHash: hashDeTokenDeSesion(token),
          sentAt: this.clock.now(),
        },
      });
      await this.outbox.encolar(tx, {
        tipo: "identity.send-invitation",
        clubId,
        payload: {
          email: correo,
          fullName: cuenta.person.fullName,
          link: `${baseUrl}/confirmar-correo?token=${token}`,
        },
      });
    });
  }

  /** Confirmar el correo nuevo (T-042). Recién aquí deja de valer el anterior. */
  async confirmarCambioDeCorreo(token: string): Promise<void> {
    const fila = await this.prisma.oneTimeToken.findUnique({
      where: { tokenHash: hashDeTokenDeSesion(token) },
      select: {
        id: true,
        type: true,
        sentAt: true,
        usedAt: true,
        userAccount: { select: { id: true, pendingEmail: true } },
      },
    });

    if (
      fila === null ||
      fila.type !== "email_change" ||
      fila.userAccount.pendingEmail === null ||
      !isOneTimeLinkValid({ sentAt: fila.sentAt, usedAt: fila.usedAt }, UN_DIA_MS, this.clock).ok
    ) {
      throw new ApiException(
        "EMAIL_CHANGE_LINK_INVALID",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Este enlace ya no sirve. Pide el cambio de correo otra vez.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: fila.userAccount.id },
        data: { email: fila.userAccount.pendingEmail ?? "", pendingEmail: null },
      });
      await tx.oneTimeToken.update({ where: { id: fila.id }, data: { usedAt: this.clock.now() } });
    });
  }

  /** Las sesiones activas de la persona (T-043, `docs/06` §1). */
  async sesiones(userAccountId: string, sessionIdActual: string): Promise<SessionResponse[]> {
    const filas = await this.prisma.session.findMany({
      where: { userAccountId, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      orderBy: { lastSeenAt: "desc" },
    });

    return filas.map((fila) => ({
      id: fila.id,
      createdAt: fila.createdAt.toISOString(),
      lastSeenAt: fila.lastSeenAt.toISOString(),
      expiresAt: fila.expiresAt.toISOString(),
      userAgent: fila.userAgent,
      rememberMe: fila.rememberMe,
      current: fila.id === sessionIdActual,
    }));
  }

  /**
   * Cerrar una sesión concreta desde la lista de dispositivos (T-043).
   *
   * Se acota por cuenta: cerrar la sesión de otra persona con adivinar un identificador sería un
   * secuestro al revés. Si no es suya, `404` — nunca `403`, que confirmaría que existe.
   */
  async cerrarSesion(userAccountId: string, sessionId: string): Promise<void> {
    const cerradas = await this.prisma.session.updateMany({
      where: { id: sessionId, userAccountId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });

    if (cerradas.count === 0) {
      throw new NotFoundException();
    }
  }

  /**
   * Qué avisos recibe esta persona (T-091).
   *
   * Devuelve **el catálogo entero**, no las filas guardadas: la tabla es una lista de exclusiones
   * —sin fila, se recibe— y una pantalla alimentada sólo con filas mostraría la lista vacía la
   * primera vez, que es justo cuando la persona quiere apagar algo.
   */
  async preferencias(userAccountId: string): Promise<NotificationPreferenceResponse[]> {
    const guardadas = await this.prisma.notificationPreference.findMany({
      where: { userAccountId },
      select: { type: true, enabled: true },
    });

    // El catálogo, más cualquier fila guardada que no esté en él: un aviso de otro módulo que la
    // persona ya apagó tiene que verse, o volvería a aparecer encendido sin estarlo.
    const tipos = [...new Set([...NOTIFICATION_TYPES, ...guardadas.map((fila) => fila.type)])];

    return tipos.sort().map((tipo) => ({
      type: tipo,
      enabled: guardadas.find((fila) => fila.type === tipo)?.enabled ?? true,
      canDisable: !esAvisoInevitable(tipo),
    }));
  }

  /**
   * Cambiar las preferencias propias (T-091).
   *
   * **Los avisos inevitables se ignoran en silencio**, y no es pereza: un `400` por mandar
   * `identity.notify-password-changed: false` obligaría a la interfaz a saber cuál es cuál para no
   * romperse, y la respuesta ya trae `canDisable` diciéndoselo. Lo que no se puede apagar
   * simplemente no se apaga, y la respuesta lo muestra encendido.
   *
   * **Lo que sí se acepta es cualquier tipo bien formado, esté o no en `NOTIFICATION_TYPES`.** Esa
   * constante describe los avisos *de este módulo*; prácticas, clases y copas traerán los suyos.
   * Exigir que cada módulo nuevo edite una constante de identidad antes de que sus avisos se
   * puedan silenciar es acoplamiento que no compra nada: una fila para un aviso que nadie manda
   * no hace daño, y el formato del contrato es lo que impide que entre basura.
   */
  async actualizarPreferencias(
    userAccountId: string,
    cambios: { type: string; enabled: boolean }[],
  ): Promise<NotificationPreferenceResponse[]> {
    const aplicables = cambios.filter((cambio) => !esAvisoInevitable(cambio.type));

    if (aplicables.length > 0) {
      await this.prisma.$transaction(
        aplicables.map((cambio) =>
          this.prisma.notificationPreference.upsert({
            where: { userAccountId_type: { userAccountId, type: cambio.type } },
            create: { userAccountId, type: cambio.type, enabled: cambio.enabled },
            update: { enabled: cambio.enabled },
          }),
        ),
      );
    }

    return this.preferencias(userAccountId);
  }
}
