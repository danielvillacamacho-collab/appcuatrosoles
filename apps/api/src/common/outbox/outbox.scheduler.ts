import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { logger } from "../logging/logger.js";
import { OutboxProcessor } from "./outbox.processor.js";

const CADA_MS = 5_000;

/**
 * Vacía la bandeja cada pocos segundos.
 *
 * **Es deliberadamente lo más simple que funciona.** `ADR-012` elige `pg-boss` para las colas y ahí
 * va a terminar esto —con reintentos, cron y visibilidad—, pero montar `pg-boss` no es requisito
 * para que el producto se pueda probar en local, y la bandeja ya garantiza lo que importa: que el
 * mensaje exista si y sólo si el cambio ocurrió (P-11). El día que entre `pg-boss`, reemplaza a
 * este archivo sin tocar a quien encola ni a quien envía.
 *
 * **No corre en los tests**: allí el procesador se llama a mano, para que una prueba no dependa de
 * cuándo saltó un temporizador.
 */
@Injectable()
export class OutboxScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private temporizador: NodeJS.Timeout | undefined;

  constructor(private readonly procesador: OutboxProcessor) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test" || process.env.OUTBOX_SCHEDULER === "off") {
      return;
    }

    this.temporizador = setInterval(() => {
      void this.procesador.procesarPendientes().catch((error: unknown) => {
        logger.error({ err: error }, "la bandeja de salida falló al vaciarse");
      });
    }, CADA_MS);

    // Sin `unref`, este temporizador mantiene vivo el proceso: `node dist/main.js` no terminaría
    // nunca con Ctrl-C limpio, y un test que olvide cerrar la aplicación se colgaría.
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    if (this.temporizador !== undefined) {
      clearInterval(this.temporizador);
    }
  }
}
