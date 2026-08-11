import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { CalendarResponse } from "@polo/contracts";
import type { ConSessionUser } from "../common/auth/current-user.js";
import { SinPermiso } from "../common/auth/require-permission.js";
import { SessionGuard } from "../common/auth/session.guard.js";
import { ZodValidationPipe } from "../common/http/zod-validation.pipe.js";
import { clubDeLaSolicitud } from "../club/tenant-de-la-solicitud.js";
import { TenantGuard } from "../tenant/tenant.guard.js";
import type { ConTenant } from "../tenant/tenant-context.js";
import { CalendarService } from "./calendar.service.js";

/**
 * Un día del calendario **es una fecha, no un instante**.
 *
 * Si llegara un `datetime`, quien llama estaría decidiendo la zona horaria — y la decide el club
 * (R-040-05). Con `YYYY-MM-DD` no hay ambigüedad que resolver mal.
 */
const ConsultaDelDia = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Se espera YYYY-MM-DD"),
});

@Controller("calendar")
@UseGuards(TenantGuard, SessionGuard)
export class CalendarController {
  constructor(private readonly servicio: CalendarService) {}

  /**
   * **No exige permiso, sólo sesión** (`plan.md` §4).
   *
   * Cualquiera del club ve la ocupación de las canchas: eso es información del club. Lo que acota
   * lo que ve no es un rol, es R-040-07 — y la aplica el servicio, no este controlador.
   */
  @Get()
  @SinPermiso("Ver la ocupación de las canchas es de cualquiera del club; el detalle lo acota R-040-07.")
  async delDia(
    @Req() req: ConTenant & ConSessionUser,
    @Query(new ZodValidationPipe(ConsultaDelDia)) consulta: z.infer<typeof ConsultaDelDia>,
  ): Promise<CalendarResponse> {
    return this.servicio.delDia(clubDeLaSolicitud(req), consulta.date, {
      userAccountId: req.sessionUser?.userAccountId ?? null,
    });
  }
}
