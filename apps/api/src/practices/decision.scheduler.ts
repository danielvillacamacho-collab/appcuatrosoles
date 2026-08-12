import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { logger } from "../common/logging/logger.js";
import { DecisionProcessor } from "./decision.processor.js";

/**
 * Cada minuto.
 *
 * La hora de decisión es una hora de reloj de pared —«las 6:00 p.m.»— y llegar hasta un minuto
 * tarde no le cambia nada a nadie. Cada cinco segundos, como la bandeja de salida, sería una
 * consulta por segundo para nada: allá el retraso se nota porque alguien está esperando un correo
 * de invitación con la pantalla abierta.
 */
const CADA_MS = 60_000;

/**
 * Dispara la decisión de las prácticas vencidas.
 *
 * **Existe porque sin él el módulo 050 no funciona en producción.** El proceso estaba construido y
 * probado, y no lo llamaba nadie: las prácticas se habrían quedado publicadas para siempre, sin
 * confirmarse ni cancelarse, y sin ningún error que lo delatara. Lo destapó revisar el repo antes
 * de avisarle al equipo de infraestructura.
 *
 * Que el proceso **no dependa de un horario** es lo que hace que este archivo pueda ser tan tonto:
 * no agenda nada por práctica, sólo pregunta cada tanto «¿hay algo vencido?». Si el servidor estuvo
 * caído dos horas, el primer tic al volver decide todo lo que quedó pendiente (R-050-11).
 *
 * **No corre en los tests**: allí el procesador se llama a mano, para que una prueba no dependa de
 * cuándo saltó un temporizador.
 */
@Injectable()
export class DecisionScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private temporizador: NodeJS.Timeout | undefined;

  constructor(private readonly procesador: DecisionProcessor) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test" || process.env.DECISION_SCHEDULER === "off") {
      return;
    }

    this.temporizador = setInterval(() => {
      void this.procesador.decidirVencidas().catch((error: unknown) => {
        logger.error({ err: error }, "la decisión de prácticas falló");
      });
    }, CADA_MS);

    // Sin `unref`, este temporizador mantiene vivo el proceso y `node dist/main.js` no terminaría
    // nunca con Ctrl-C limpio.
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    if (this.temporizador !== undefined) {
      clearInterval(this.temporizador);
    }
  }
}
