import { Body, Controller, Get, Param, Put, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import {
  ClubHandicapListResponse,
  HandicapHistoryResponse,
  HandicapTypeSchema,
  PaginationQuery,
  PersonHandicapsResponse,
  SetHandicapRequest,
  type HandicapTypeName,
} from "@polo/contracts";
import { z } from "zod";
import { AuditInterceptor } from "../common/audit/audit.interceptor.js";
import { Auditable, type ConAuditoria } from "../common/audit/auditable.js";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { PermissionGuard } from "../common/auth/permission.guard.js";
import { RequirePermission, SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { HandicapsService, type ActorDeHandicap } from "./handicaps.service.js";

type Solicitud = ConTenant & ConSessionUser & ConAuditoria;

/** El tipo llega en la ruta, así que se valida como cualquier otra entrada. */
const TipoEnLaRuta = z.object({ type: HandicapTypeSchema });

const ConsultaDelClub = PaginationQuery.extend({ type: HandicapTypeSchema.default("club") });

/**
 * Handicaps de una persona (`specs/030` §8).
 *
 * **Leer no exige permiso administrativo, sólo sesión**: el handicap vigente es público dentro del
 * club (R-030-09). Fijarlo exige `handicap.edit`, que tiene el comisario **y nadie más** — ni el
 * administrador del club, ni el superadministrador de la plataforma.
 */
@Controller("people/:id/handicaps")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
@UseInterceptors(AuditInterceptor)
export class PersonHandicapsController {
  constructor(private readonly servicio: HandicapsService) {}

  @Get()
  @SinPermiso("El handicap vigente es público dentro del club: hace falta para leer un equipo.")
  async vigentes(
    @Req() req: Solicitud,
    @Param("id") personId: string,
  ): Promise<PersonHandicapsResponse> {
    return this.servicio.delPersona(clubDeLaSolicitud(req), personId);
  }

  /**
   * El historial.
   *
   * **No lleva `@RequirePermission`** porque el permiso no alcanza a describir quién puede: la
   * propia persona y su acudiente lo ven sin tener ningún permiso administrativo. La regla completa
   * es R-030-09 y la aplica el servicio, que es quien puede consultar los acudientes.
   */
  @Get("history")
  @SinPermiso("Quién puede verlo lo decide R-030-09 en el servicio, no un permiso.")
  async historial(
    @Req() req: Solicitud,
    @Param("id") personId: string,
  ): Promise<HandicapHistoryResponse> {
    return this.servicio.historial(clubDeLaSolicitud(req), personId, actorDe(req));
  }

  /**
   * Fijar un handicap. `PUT` y no `PATCH`: es reemplazar un valor completo por otro.
   */
  @Put(":type")
  @RequirePermission("handicap.edit")
  @Auditable({ action: "handicap.changed", entityType: "player_handicap" })
  async fijar(
    @Req() req: Solicitud,
    @Param("id") personId: string,
    @Param(new ZodValidationPipe(TipoEnLaRuta)) parametros: { type: HandicapTypeName },
    @Body(new ZodValidationPipe(SetHandicapRequest)) datos: SetHandicapRequest,
  ): Promise<PersonHandicapsResponse> {
    return this.servicio.fijar(
      clubDeLaSolicitud(req),
      personId,
      parametros.type,
      datos,
      actorDe(req),
    );
  }
}

/** El handicap de todo el club, para armar equipos sin N+1 consultas. */
@Controller("handicaps")
@UseGuards(TenantGuard, SessionGuard, PermissionGuard)
export class ClubHandicapsController {
  constructor(private readonly servicio: HandicapsService) {}

  @Get()
  @SinPermiso("Mismo criterio que el vigente de una persona: es información del club.")
  async delClub(
    @Req() req: Solicitud,
    @Query(new ZodValidationPipe(ConsultaDelClub)) consulta: z.infer<typeof ConsultaDelClub>,
  ): Promise<ClubHandicapListResponse> {
    return this.servicio.delClub(clubDeLaSolicitud(req), consulta.type, {
      page: consulta.page,
      limit: consulta.limit,
    });
  }
}

/** Quién pregunta. Los roles los carga el servicio; aquí sólo viaja quién es. */
function actorDe(req: Solicitud): ActorDeHandicap {
  const usuario = req.sessionUser;

  if (usuario === undefined) {
    throw new Error("Ruta sin SessionGuard: no hay usuario en la solicitud (T-021).");
  }

  return { userAccountId: usuario.userAccountId, personId: usuario.personId };
}
