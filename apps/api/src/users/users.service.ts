import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { Prisma, UserAccountStatus } from "@prisma/client";
import type { CreateUserRequest, UpdateUserRequest, UserResponse } from "@polo/contracts";
import {
  canAssignRole,
  isOneTimeLinkValid,
  validatePassword,
  type Clock,
  type RoleAssignmentRef,
  type RoleName,
  type ScopeKind,
} from "@polo/domain";
import { MENSAJES_DE_POLITICA } from "../auth/auth.service.js";
import { PasswordService } from "../auth/password.service.js";
import { CLOCK } from "../common/clock/clock.module.js";
import { ApiException } from "../common/errors/api-error.js";
import { OutboxRepository } from "../common/outbox/outbox.repository.js";
import { PrismaService } from "../common/prisma/prisma.service.js";
import { SIN_CONTRASENA } from "../club/create-club.js";
import { crearTokenDeSesion, hashDeTokenDeSesion } from "../common/auth/session-token.js";
import { SettingsService } from "../settings/settings.service.js";

const UN_DIA_MS = 24 * 60 * 60 * 1000;

export interface Actor {
  userAccountId: string;
  roles: RoleAssignmentRef[];
}

export interface FiltrosDeUsuarios {
  status?: UserAccountStatus;
  role?: RoleName;
  organizationId?: string;
  membershipCategoryId?: string;
  q?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly outbox: OutboxRepository,
    private readonly settings: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Crear un usuario (T-050, HU-010-01).
   *
   * Nace `invited` y sin contraseña utilizable: la define su titular con el enlace. Todo va en una
   * transacción con el encolado del correo (P-11) — un usuario creado cuya invitación nunca sale
   * es una persona esperando algo que no va a llegar, y nadie se entera hasta que pregunta.
   */
  async crear(
    actor: Actor,
    clubId: string,
    datos: CreateUserRequest,
    baseUrl: string,
  ): Promise<UserResponse> {
    const correo = datos.email.trim().toLowerCase();

    if ((await this.prisma.userAccount.findUnique({ where: { email: correo } })) !== null) {
      // HU-010-01, segundo criterio. Aquí sí se dice: quien crea usuarios es administrador del
      // club y necesita saber que esa persona ya tiene cuenta para no crear una duplicada.
      throw new ConflictException({ code: "email_en_uso" });
    }

    for (const rol of datos.roles) {
      this.exigirQuePuedaOtorgar(actor, rol, clubId, datos.organizationId);
    }

    await this.exigirCategoriaDelClub(clubId, datos.membershipCategoryId);
    await this.exigirPersonaSinCuenta(clubId, datos.personId);

    const token = crearTokenDeSesion();

    const cuentaId = await this.prisma.$transaction(async (tx) => {
      const persona =
        datos.personId === undefined
          ? await tx.person.create({
              data: {
                clubId,
                // Sin nombre, la parte local del correo. Es provisional y se ve como tal: la
                // persona la reemplaza al aceptar, y mientras tanto el administrador ve algo
                // reconocible en la lista en vez de una fila en blanco.
                fullName: datos.fullName ?? nombreProvisional(correo),
                ...(datos.phone === undefined ? {} : { phone: datos.phone }),
                createdById: actor.userAccountId,
              },
            })
          : // Sobre la persona que ya está: el invitado externo de una copa, el menor que cumplió
            // la edad del club. **No se crea otra** —eso dejaría al club con dos fichas del mismo
            // jugador y el historial en la vieja— y tampoco se le cambia el nombre de paso.
            await tx.person.update({
              where: { id: datos.personId },
              data: {
                ...(datos.phone === undefined ? {} : { phone: datos.phone }),
                // Deja de ser un perfil administrado por otro: desde que tiene contraseña, manda
                // sobre lo suyo. Su historia —vínculos, membresías, waivers— no se toca.
                isMinor: false,
              },
            });
      const cuenta = await tx.userAccount.create({
        data: { personId: persona.id, email: correo, passwordHash: SIN_CONTRASENA, status: "invited" },
      });

      for (const rol of datos.roles) {
        await tx.roleAssignment.create({
          data: {
            userAccountId: cuenta.id,
            role: rol,
            scope: ambitoDe(rol),
            scopeId: ambitoDe(rol) === "organization" ? (datos.organizationId ?? "") : clubId,
            grantedById: actor.userAccountId,
          },
        });
      }

      // Un rol de organización sin vínculo con la organización deja a la persona con autoridad
      // ahí y sin pertenecer: no aparecería en el listado de su propia escuela, y su administrador
      // no podría verla ni administrarla. El rol dice **qué puede hacer**; el vínculo, **dónde
      // está** — y hacen falta los dos.
      if (datos.organizationId !== undefined && datos.roles.some((rol) => ambitoDe(rol) === "organization")) {
        await tx.personOrganization.create({
          data: {
            clubId,
            personId: persona.id,
            organizationId: datos.organizationId,
            relationship: "staff",
            joinedOn: this.clock.now(),
          },
        });
      }

      if (datos.membershipCategoryId !== undefined) {
        await tx.membershipAssignment.create({
          data: {
            clubId,
            personId: persona.id,
            membershipCategoryId: datos.membershipCategoryId,
            effectiveFrom: this.clock.now(),
            assignedById: actor.userAccountId,
          },
        });
      }

      await tx.oneTimeToken.create({
        data: {
          userAccountId: cuenta.id,
          type: "invitation",
          tokenHash: hashDeTokenDeSesion(token),
          sentAt: this.clock.now(),
        },
      });
      await this.outbox.encolar(tx, {
        tipo: "identity.send-invitation",
        clubId,
        payload: {
          email: correo,
          fullName: datos.fullName,
          link: `${baseUrl}/aceptar-invitacion?token=${token}`,
        },
      });

      return cuenta.id;
    });

    return this.detalle(clubId, cuentaId);
  }

  /**
   * Reenviar la invitación (T-053).
   *
   * **El enlace anterior deja de servir**: se marcan como usados los tokens de invitación vivos
   * antes de crear el nuevo. Si el primero se filtró —un correo reenviado, un buzón compartido—,
   * reenviar tiene que cerrarlo, no sumar un segundo enlace válido.
   */
  async reenviarInvitacion(clubId: string, id: string, baseUrl: string): Promise<void> {
    const cuenta = await this.buscarDelClub(clubId, id);

    if (cuenta.status !== "invited") {
      throw new ConflictException({ code: "la_cuenta_ya_no_esta_invitada" });
    }

    const token = crearTokenDeSesion();
    const ahora = this.clock.now();

    await this.prisma.$transaction(async (tx) => {
      await tx.oneTimeToken.updateMany({
        where: { userAccountId: cuenta.id, type: "invitation", usedAt: null },
        data: { usedAt: ahora },
      });
      await tx.oneTimeToken.create({
        data: {
          userAccountId: cuenta.id,
          type: "invitation",
          tokenHash: hashDeTokenDeSesion(token),
          sentAt: ahora,
        },
      });
      await this.outbox.encolar(tx, {
        tipo: "identity.send-invitation",
        clubId,
        payload: {
          email: cuenta.email,
          fullName: cuenta.person.fullName,
          link: `${baseUrl}/aceptar-invitacion?token=${token}`,
        },
      });
    });
  }

  /** Definir la primera contraseña con el enlace (HU-010-02). Deja la cuenta `active`. */
  async aceptarInvitacion(
    token: string,
    contrasena: string,
    datos: { fullName?: string | undefined; phone?: string | undefined } = {},
  ): Promise<void> {
    const fila = await this.prisma.oneTimeToken.findUnique({
      where: { tokenHash: hashDeTokenDeSesion(token) },
      select: {
        id: true,
        type: true,
        sentAt: true,
        usedAt: true,
        userAccount: {
          select: {
            id: true,
            email: true,
            status: true,
            person: { select: { id: true, fullName: true, phone: true } },
          },
        },
      },
    });

    const validez = await this.ventanaDeInvitacion();

    if (
      fila === null ||
      fila.type !== "invitation" ||
      fila.userAccount.status !== "invited" ||
      !isOneTimeLinkValid({ sentAt: fila.sentAt, usedAt: fila.usedAt }, validez, this.clock).ok
    ) {
      throw new ApiException(
        "INVITATION_LINK_INVALID",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Este enlace ya no sirve. Pídele al club que te reenvíe la invitación.",
      );
    }

    const politica = validatePassword(contrasena, fila.userAccount.email);

    if (!politica.ok) {
      throw new ApiException(
        "PASSWORD_POLICY",
        HttpStatus.UNPROCESSABLE_ENTITY,
        MENSAJES_DE_POLITICA[politica.error],
      );
    }

    const hash = await this.passwords.hash(contrasena);

    // Sólo se completa lo que el club dejó en blanco. Quien invita con nombre completo lo hizo
    // por algo —así aparece esa persona en la lista del club— y un enlace de invitación no es el
    // lugar para que alguien se renombre.
    const persona = fila.userAccount.person;
    const provisional = persona.fullName === nombreProvisional(fila.userAccount.email);
    const aCompletar = {
      ...(provisional && datos.fullName !== undefined ? { fullName: datos.fullName } : {}),
      ...(persona.phone === null && datos.phone !== undefined ? { phone: datos.phone } : {}),
    };

    await this.prisma.$transaction([
      this.prisma.userAccount.update({
        where: { id: fila.userAccount.id },
        data: { passwordHash: hash, status: "active", emailVerifiedAt: this.clock.now() },
      }),
      this.prisma.person.update({ where: { id: persona.id }, data: aCompletar }),
      this.prisma.oneTimeToken.update({ where: { id: fila.id }, data: { usedAt: this.clock.now() } }),
    ]);
  }

  /** Listado con filtros (T-054). **Siempre acotado al club**, y a la organización si el actor es de una. */
  async listar(actor: Actor, clubId: string, filtros: FiltrosDeUsuarios): Promise<UserResponse[]> {
    const organizacionesDelActor = organizacionesDe(actor);
    const soloDeSusOrganizaciones = mandaSoloEnOrganizaciones(actor);

    const cuentas = await this.prisma.userAccount.findMany({
      where: {
        person: {
          clubId,
          ...(filtros.q === undefined
            ? {}
            : { fullName: { contains: filtros.q, mode: "insensitive" } }),
          ...filtroDeOrganizacion(soloDeSusOrganizaciones, organizacionesDelActor, filtros.organizationId),
          ...(filtros.membershipCategoryId === undefined
            ? {}
            : {
                membershipHistory: {
                  some: { effectiveTo: null, membershipCategoryId: filtros.membershipCategoryId },
                },
              }),
        },
        ...(filtros.status === undefined ? {} : { status: filtros.status }),
        ...(filtros.role === undefined
          ? {}
          : { roleAssignments: { some: { role: filtros.role, revokedAt: null } } }),
      },
      select: SELECCION,
      orderBy: { person: { fullName: "asc" } },
    });

    return cuentas.map((cuenta) => aRespuesta(cuenta));
  }

  async detalle(clubId: string, id: string): Promise<UserResponse> {
    return aRespuesta(await this.buscarDelClub(clubId, id));
  }

  async actualizar(clubId: string, id: string, cambios: UpdateUserRequest): Promise<UserResponse> {
    const cuenta = await this.buscarDelClub(clubId, id);

    await this.exigirCategoriaDelClub(clubId, cambios.membershipCategoryId ?? undefined);

    await this.prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: cuenta.person.id },
        data: {
          ...(cambios.fullName === undefined ? {} : { fullName: cambios.fullName }),
          ...(cambios.phone === undefined ? {} : { phone: cambios.phone }),
        },
      });

      if (cambios.membershipCategoryId !== undefined && cambios.membershipCategoryId !== null) {
        await this.cambiarCategoria(tx, clubId, cuenta.person.id, cambios.membershipCategoryId, cuenta.id);
      }
    });

    return this.detalle(clubId, id);
  }

  /**
   * Cambiar la categoría de membresía sin perder la historia (T-072, P-06).
   *
   * El caso normal cierra la vigente y abre una nueva: el club tiene que poder responder «con qué
   * categoría jugaba en marzo».
   *
   * **El caso del mismo día es distinto y la base lo impone**: `effective_to > effective_from` y el
   * rango de exclusión es `[from, to)`, así que una asignación que empezó hoy no se puede cerrar
   * hoy. Y tiene sentido — nunca estuvo vigente un día completo, no hay historia que conservar. Se
   * corrige la fila en vez de apilar una segunda, que es lo que haría el sistema si dejáramos que
   * la restricción decidiera por error.
   */
  private async cambiarCategoria(
    tx: Prisma.TransactionClient,
    clubId: string,
    personId: string,
    membershipCategoryId: string,
    assignedById: string,
  ): Promise<void> {
    const hoy = this.clock.now();
    const vigente = await tx.membershipAssignment.findFirst({
      where: { personId, effectiveTo: null },
      orderBy: { effectiveFrom: "desc" },
    });

    if (vigente !== null && mismoDia(vigente.effectiveFrom, hoy)) {
      await tx.membershipAssignment.update({
        where: { id: vigente.id },
        data: { membershipCategoryId, assignedById },
      });

      return;
    }

    if (vigente !== null) {
      await tx.membershipAssignment.update({ where: { id: vigente.id }, data: { effectiveTo: hoy } });
    }

    await tx.membershipAssignment.create({
      data: { clubId, personId, membershipCategoryId, effectiveFrom: hoy, assignedById },
    });
  }

  /**
   * Suspender (T-056). **Revoca todas las sesiones en el acto**: cambiar el estado sin cortar las
   * sesiones deja a la persona trabajando hasta que la suya venza sola, que puede ser un mes.
   */
  async cambiarEstado(
    actor: Actor,
    clubId: string,
    id: string,
    estado: UserAccountStatus,
  ): Promise<UserResponse> {
    const cuenta = await this.buscarDelClub(clubId, id);

    this.exigirQueNoSeaElMismo(actor, cuenta.id, estado);

    const ahora = this.clock.now();
    const cortaElAcceso = estado === "suspended" || estado === "archived";

    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.update({ where: { id: cuenta.id }, data: { status: estado } });

      if (cortaElAcceso) {
        await tx.session.updateMany({
          where: { userAccountId: cuenta.id, revokedAt: null },
          data: { revokedAt: ahora },
        });
      }

      await this.outbox.encolar(tx, {
        tipo: "identity.notify-account-status-changed",
        clubId,
        payload: { email: cuenta.email, fullName: cuenta.person.fullName, status: estado },
      });
    });

    return this.detalle(clubId, id);
  }

  /**
   * Otorgar un rol (T-060, R-010-11).
   *
   * La regla exacta la decide `canAssignRole` en el dominio: quién puede otorgar qué, y dónde. El
   * guard ya dejó pasar «este actor administra usuarios aquí»; esto decide «puede otorgar **este**
   * rol».
   */
  async otorgarRol(
    actor: Actor,
    clubId: string,
    id: string,
    rol: RoleName,
    scope: ScopeKind,
    scopeId: string,
  ): Promise<UserResponse> {
    const cuenta = await this.buscarDelClub(clubId, id);

    this.exigirQuePuedaOtorgar(actor, rol, clubId, scope === "organization" ? scopeId : undefined);

    if (scope === "organization") {
      const organizacion = await this.prisma.organization.findFirst({
        where: { id: scopeId, clubId },
        select: { id: true },
      });

      // Una organización de otro club no existe desde aquí (P-05).
      if (organizacion === null) {
        throw new NotFoundException();
      }
    }

    const yaLoTiene = await this.prisma.roleAssignment.findFirst({
      where: { userAccountId: cuenta.id, role: rol, scope, scopeId, revokedAt: null },
    });

    if (yaLoTiene !== null) {
      throw new ConflictException({ code: "ya_tiene_ese_rol" });
    }

    await this.prisma.roleAssignment.create({
      data: {
        userAccountId: cuenta.id,
        role: rol,
        scope,
        scopeId,
        grantedById: actor.userAccountId,
      },
    });

    return this.detalle(clubId, id);
  }

  /**
   * Retirar un rol (T-061). **Efecto inmediato**: se revoca la asignación, y `PermissionGuard`
   * consulta las vigentes en cada solicitud, así que la siguiente petición ya no pasa.
   *
   * No se borra la fila (P-06): `revoked_at` y `revoked_by_id` son la respuesta a «¿quién le quitó
   * el rol y cuándo?», que es justo lo que se pregunta cuando algo salió mal.
   */
  async retirarRol(actor: Actor, clubId: string, id: string, roleAssignmentId: string): Promise<UserResponse> {
    const cuenta = await this.buscarDelClub(clubId, id);

    if (actor.userAccountId === cuenta.id) {
      // R-010-05: nadie se retira roles a sí mismo, ni siquiera un superadministrador. Es lo que
      // evita que el único administrador del club se quede afuera por un clic.
      throw new ForbiddenException({ code: "no_puedes_hacerte_esto_a_ti_mismo" });
    }

    const asignacion = await this.prisma.roleAssignment.findFirst({
      where: { id: roleAssignmentId, userAccountId: cuenta.id, revokedAt: null },
      select: { id: true, role: true, scope: true, scopeId: true },
    });

    if (asignacion === null) {
      throw new NotFoundException();
    }

    // Quien puede otorgar un rol es quien puede retirarlo: la simetría evita que alguien retire lo
    // que no podría volver a poner.
    this.exigirQuePuedaOtorgar(
      actor,
      aRolDeDominio(asignacion.role),
      clubId,
      asignacion.scope === "organization" ? (asignacion.scopeId ?? undefined) : undefined,
    );

    await this.prisma.roleAssignment.update({
      where: { id: asignacion.id },
      data: { revokedAt: this.clock.now(), revokedById: actor.userAccountId },
    });

    return this.detalle(clubId, id);
  }

  /**
   * Auto-protección (R-010-05, T-058): nadie se suspende, archiva ni se retira roles a sí mismo,
   * **ni siquiera un superadministrador**.
   *
   * No es paternalismo: es lo que evita que el único administrador de un club se deje afuera por
   * un clic, y que quedarse sin acceso dependa de que otra persona esté disponible para arreglarlo.
   */
  private exigirQueNoSeaElMismo(actor: Actor, cuentaId: string, estado: UserAccountStatus): void {
    if (actor.userAccountId === cuentaId && estado !== "active") {
      throw new ForbiddenException({ code: "no_puedes_hacerte_esto_a_ti_mismo" });
    }
  }

  private exigirQuePuedaOtorgar(
    actor: Actor,
    rol: RoleName,
    clubId: string,
    organizationId: string | undefined,
  ): void {
    const scope = ambitoDe(rol);
    const veredicto = canAssignRole({ roles: actor.roles }, {
      role: rol,
      scope,
      scopeId: scope === "organization" ? (organizationId ?? "") : clubId,
      clubId,
    });

    if (!veredicto.ok) {
      // La regla exacta la decide `canAssignRole` en el dominio (T-011). El guard ya dejó pasar
      // «este actor administra usuarios aquí»; esto decide «puede otorgar *este* rol».
      throw new ForbiddenException({ code: veredicto.error });
    }
  }

  /**
   * La persona sobre la que se va a crear la cuenta existe en este club y **todavía no tiene una**.
   *
   * Dos cuentas para una persona sería dos formas de entrar a lo mismo, y ninguna sabría de la
   * otra. Una persona de otro club responde 404 y no 403 (P-05): desde aquí no existe.
   */
  private async exigirPersonaSinCuenta(clubId: string, personId: string | undefined): Promise<void> {
    if (personId === undefined) {
      return;
    }

    const persona = await this.prisma.person.findFirst({
      where: { id: personId, clubId },
      select: { userAccount: { select: { id: true } } },
    });

    if (persona === null) {
      throw new NotFoundException();
    }

    if (persona.userAccount !== null) {
      throw new ConflictException({ code: "la_persona_ya_tiene_cuenta" });
    }
  }

  private async exigirCategoriaDelClub(clubId: string, categoriaId?: string): Promise<void> {
    if (categoriaId === undefined) return;

    const existe = await this.prisma.membershipCategory.findFirst({
      where: { id: categoriaId, clubId },
      select: { id: true },
    });

    if (existe === null) {
      throw new UnprocessableEntityException({ code: "categoria_desconocida" });
    }
  }

  /**
   * Buscar acotando por club **en la consulta**, no comparando después: la fila de otro club ni se
   * lee. Si no aparece, `404` — nunca `403` (P-05, `docs/03` §3).
   */
  private async buscarDelClub(clubId: string, id: string): Promise<CuentaSeleccionada> {
    const cuenta = await this.prisma.userAccount.findFirst({
      where: { id, person: { clubId } },
      select: SELECCION,
    });

    if (cuenta === null) {
      throw new NotFoundException();
    }

    return cuenta;
  }

  private async ventanaDeInvitacion(): Promise<number> {
    const resuelto = await this.settings.leer(
      { scope: "platform", clubId: null, organizationId: null },
      "auth.invitation_link_validity_days",
    );

    return (typeof resuelto.value === "number" ? resuelto.value : 7) * UN_DIA_MS;
  }
}

/**
 * El nombre con el que nace una ficha invitada sólo-con-correo: la parte local del correo.
 *
 * Que sea una función y no un literal es lo que permite reconocerla después: al aceptar, el
 * servicio compara contra esto para saber si el nombre es todavía el provisional o si el club puso
 * uno de verdad — y en el segundo caso, no lo pisa.
 */
function nombreProvisional(email: string): string {
  return email.replace(/@.*$/u, "");
}

const SELECCION = {
  id: true,
  email: true,
  status: true,
  // La invitación vigente, para responder «¿le llegó, y cuándo?» (HU-010-01, criterio 3). Sólo la
  // sin usar: una ya usada no dice nada sobre la que está esperando.
  oneTimeTokens: {
    where: { type: "invitation" as const, usedAt: null },
    orderBy: { sentAt: "desc" as const },
    take: 1,
    select: { sentAt: true },
  },
  person: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      organizations: {
        where: { leftOn: null },
        select: { organization: { select: { id: true, name: true } } },
      },
      membershipHistory: {
        where: { effectiveTo: null },
        select: { category: { select: { id: true, code: true, name: true } } },
        take: 1,
      },
    },
  },
  roleAssignments: {
    where: { revokedAt: null },
    select: { id: true, role: true, scope: true, scopeId: true },
  },
} satisfies Prisma.UserAccountSelect;

type CuentaSeleccionada = Prisma.UserAccountGetPayload<{ select: typeof SELECCION }>;

function aRespuesta(cuenta: CuentaSeleccionada): UserResponse {
  return {
    id: cuenta.id,
    personId: cuenta.person.id,
    fullName: cuenta.person.fullName,
    email: cuenta.email,
    phone: cuenta.person.phone,
    status: cuenta.status,
    invitationSentAt: cuenta.oneTimeTokens[0]?.sentAt.toISOString() ?? null,
    roles: cuenta.roleAssignments,
    membershipCategory: cuenta.person.membershipHistory[0]?.category ?? null,
    organizations: cuenta.person.organizations.map((vinculo) => vinculo.organization),
  };
}

/**
 * El filtro por organización, que tiene dos orígenes: el que pidió quien consulta, y el que impone
 * ser administrador de organización — que **no es negociable** y gana siempre (R-010-04, T-054).
 */
function filtroDeOrganizacion(
  acotadoASusOrganizaciones: boolean,
  suyas: string[],
  pedida: string | undefined,
): Prisma.PersonWhereInput {
  if (acotadoASusOrganizaciones) {
    return { organizations: { some: { leftOn: null, organizationId: { in: suyas } } } };
  }

  if (pedida === undefined) {
    return {};
  }

  return { organizations: { some: { leftOn: null, organizationId: pedida } } };
}

function aRolDeDominio(rol: string): RoleName {
  return rol as RoleName;
}

/** Compara **días de calendario**, no instantes: las columnas de vigencia son `date` (T-014). */
function mismoDia(unaFecha: Date, otraFecha: Date): boolean {
  return unaFecha.toISOString().slice(0, 10) === otraFecha.toISOString().slice(0, 10);
}

/** El ámbito propio de cada rol (`docs/06` §4). `treasurer` vive en dos y se asume el del club. */
function ambitoDe(rol: RoleName): ScopeKind {
  return rol === "instructor" || rol === "groom" || rol === "organization_admin"
    ? "organization"
    : "club";
}

function organizacionesDe(actor: Actor): string[] {
  return actor.roles
    .filter((rol) => rol.scope === "organization" && rol.scopeId !== null)
    .map((rol) => rol.scopeId ?? "");
}

/** Manda sólo en organizaciones quien no tiene ningún rol de club ni de plataforma. */
function mandaSoloEnOrganizaciones(actor: Actor): boolean {
  const tieneAlcanceAmplio = actor.roles.some(
    (rol) =>
      rol.scope === "platform" ||
      (rol.scope === "club" && (rol.role === "club_admin" || rol.role === "superadmin")),
  );

  return !tieneAlcanceAmplio && organizacionesDe(actor).length > 0;
}
