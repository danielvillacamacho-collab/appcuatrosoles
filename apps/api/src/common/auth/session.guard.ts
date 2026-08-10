import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { UserAccountStatus } from "@prisma/client";
import type { Request } from "express";
import { accountStatusAllowsLogin, type AccountStatus, type Clock } from "@polo/domain";
import { CLOCK } from "../clock/clock.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ConSessionUser } from "./current-user.js";
import { COOKIE_DE_SESION, hashDeTokenDeSesion } from "./session-token.js";

/** Lo que Express expone tras `cookie-parser`. */
interface ConCookies {
  cookies?: Record<string, string | undefined>;
}

/**
 * Exige una sesión válida y pega el usuario al request (`docs/06` §1, ADR-005).
 *
 * **Todos los rechazos son idénticos.** Sin cookie, cookie inventada, sesión revocada, sesión
 * vencida o cuenta suspendida producen exactamente la misma respuesta `401`, sin `details` y sin
 * mensaje distinto. `docs/03` §3 lo dice para el estado 401 —«nunca distingue "no existe" de
 * "expiró"»— y la razón es P-12: un mensaje que diferencie «esa sesión ya no existe» de «esa
 * sesión venció» le confirma a quien está probando cookies robadas cuáles fueron válidas alguna
 * vez. Hay un test que compara los cuerpos de los cinco rechazos byte a byte.
 *
 * No escribe nada: un guard que actualiza `last_seen_at` convierte cada lectura en una escritura,
 * y con eso el cierre por inactividad se paga en cada solicitud de cada usuario. Cuando se defina
 * `auth.session_idle_timeout_hours` (`docs/08` §9, hoy «exacto por definir») entra con su propia
 * tarea y su propia decisión sobre cada cuánto refrescar.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request & ConCookies & ConSessionUser>();
    const token = req.cookies?.[COOKIE_DE_SESION];

    if (token === undefined || token === "") {
      throw new UnauthorizedException();
    }

    const sesion = await this.prisma.session.findUnique({
      // Se busca por el hash, no por el token: la base nunca ve el valor que trae la cookie.
      where: { tokenHash: hashDeTokenDeSesion(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        userAccount: { select: { id: true, personId: true, status: true } },
      },
    });

    if (sesion === null || sesion.revokedAt !== null) {
      throw new UnauthorizedException();
    }

    if (sesion.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw new UnauthorizedException();
    }

    /**
     * Segunda barrera, a propósito redundante. Suspender una cuenta ya revoca sus sesiones en el
     * mismo movimiento (T-056), así que en teoría no debería existir una sesión viva de una cuenta
     * suspendida. Pero «en teoría» es exactamente lo que falla: si esa revocación se rompe algún
     * día, o queda una sesión emitida antes del cambio, quien fue suspendido sigue entrando. El
     * costo de comprobarlo son cero consultas extra —el estado viene en el mismo `select`— y lo
     * que compra es que el corte de acceso no dependa de que otra tarea haya hecho bien su parte.
     */
    if (!accountStatusAllowsLogin(aEstadoDeDominio(sesion.userAccount.status))) {
      throw new UnauthorizedException();
    }

    req.sessionUser = {
      userAccountId: sesion.userAccount.id,
      personId: sesion.userAccount.personId,
      sessionId: sesion.id,
    };

    return true;
  }
}

/**
 * Traduce el enum de Prisma al vocabulario del dominio (P-01: el dominio no conoce la base).
 *
 * Hoy las dos listas coinciden palabra por palabra, así que el cuerpo es la identidad — pero la
 * **firma** es la que trabaja: si algún día se agrega un estado en `schema.prisma` que el dominio
 * no contempla, esto deja de compilar y obliga a decidir si esa cuenta puede entrar. Sin esta
 * función, un estado nuevo entraría al dominio sin que nadie lo evaluara.
 */
function aEstadoDeDominio(estado: UserAccountStatus): AccountStatus {
  return estado;
}
