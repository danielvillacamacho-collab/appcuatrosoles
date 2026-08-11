import { Inject, Injectable } from "@nestjs/common";
import { debeEnviarse, esAvisoInevitable, type Clock } from "@polo/domain";
import { CLOCK } from "../clock/clock.module.js";
import { logger } from "../logging/logger.js";
import { MAILER, type Mailer } from "../mailer/mailer.port.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { construirCorreo } from "./mensajes.js";

/** Cuántos intentos antes de dejar de reintentar. */
const INTENTOS_MAXIMOS = 5;
/** Espera entre reintentos, creciente: 1, 4, 9, 16 minutos. */
const ESPERA_BASE_MS = 60_000;

@Injectable()
export class OutboxProcessor {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Envía los mensajes pendientes que ya se pueden enviar.
   *
   * **Marca antes de enviar, no después.** Si se marcara después, un proceso que muere entre el
   * envío y la marca dejaría el mensaje pendiente y lo enviaría otra vez: dos invitaciones, dos
   * enlaces válidos. Al revés, el peor caso es un correo que no llega — molesto, pero recuperable
   * pidiendo el reenvío; un enlace de restablecimiento duplicado no lo es.
   *
   * Devuelve cuántos procesó, que es lo que necesita el arnés de pruebas para no adivinar.
   */
  async procesarPendientes(limite = 20): Promise<number> {
    const ahora = this.clock.now();
    const pendientes = await this.prisma.outboxMessage.findMany({
      where: { sentAt: null, availableAt: { lte: ahora }, attempts: { lt: INTENTOS_MAXIMOS } },
      orderBy: { createdAt: "asc" },
      take: limite,
    });

    let procesados = 0;

    for (const mensaje of pendientes) {
      // La marca se hace con `updateMany` filtrando por `sent_at IS NULL`: si dos procesadores
      // corrieran a la vez —dos instancias de la API, o el worker y la API— sólo uno se lleva el
      // mensaje. El otro actualiza cero filas y sigue de largo.
      const tomado = await this.prisma.outboxMessage.updateMany({
        where: { id: mensaje.id, sentAt: null },
        data: { sentAt: ahora, attempts: mensaje.attempts + 1 },
      });

      if (tomado.count === 0) {
        continue;
      }

      try {
        if (await this.leDebeLlegar(mensaje.type, mensaje.payload)) {
          await this.mailer.enviar(construirCorreo(mensaje.type, mensaje.payload));
        }

        // Se cuenta como procesado igual cuando se omite por preferencia: el trabajo está hecho, y
        // dejarlo pendiente lo haría reintentar para siempre.
        procesados += 1;
      } catch (error) {
        // Falló el envío: se devuelve a la cola con espera creciente y se guarda el motivo. Al
        // quinto intento deja de reintentarse solo — un correo que falla cinco veces necesita que
        // alguien mire, no un sexto intento.
        const intentos = mensaje.attempts + 1;
        await this.prisma.outboxMessage.update({
          where: { id: mensaje.id },
          data: {
            sentAt: null,
            availableAt: new Date(ahora.getTime() + intentos * intentos * ESPERA_BASE_MS),
            lastError: error instanceof Error ? error.message : String(error),
          },
        });

        logger.error({ err: error, mensajeId: mensaje.id, intentos }, "envío fallido");
      }
    }

    return procesados;
  }

  /**
   * ¿Esta persona quiere este aviso? (T-091)
   *
   * La regla —qué se puede apagar— vive en `packages/domain`; aquí sólo se consultan sus
   * preferencias. Los avisos de seguridad no llegan siquiera a preguntar.
   */
  private async leDebeLlegar(tipo: string, payload: unknown): Promise<boolean> {
    // Se pregunta primero por lo inevitable y no con `debeEnviarse(tipo, [])`: sin preferencias
    // esa función dice que sí a todo —la tabla es de exclusiones—, así que serviría de atajo para
    // cualquier aviso y no sólo para los que no se pueden apagar.
    if (esAvisoInevitable(tipo)) {
      return true;
    }

    const correo =
      payload !== null && typeof payload === "object" && "email" in payload
        ? (payload as { email?: unknown }).email
        : undefined;

    if (typeof correo !== "string") {
      return true;
    }

    const preferencias = await this.prisma.notificationPreference.findMany({
      where: { userAccount: { email: correo } },
      select: { type: true, enabled: true },
    });

    return debeEnviarse(tipo, preferencias);
  }
}
