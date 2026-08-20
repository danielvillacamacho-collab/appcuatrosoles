import { Global, Module } from "@nestjs/common";
import { CLOCK } from "../clock/clock.module.js";
import { construirMailer } from "../mailer/mailer.factory.js";
import { MAILER } from "../mailer/mailer.port.js";
import { OutboxProcessor } from "./outbox.processor.js";
import { OutboxRepository } from "./outbox.repository.js";
import { OutboxScheduler } from "./outbox.scheduler.js";

/**
 * La bandeja de salida y su envío.
 *
 * El adaptador de correo se elige aquí y en ningún otro lugar. Cuál, lo decide el entorno:
 * `construirMailer` devuelve `SesMailer` (ADR-008) o `MailerDeArchivo` según `MAILER`, y se niega a
 * arrancar si en producción nadie tomó la decisión. Ver `mailer.selection.ts` para el por qué.
 */
@Global()
@Module({
  providers: [
    OutboxRepository,
    OutboxProcessor,
    OutboxScheduler,
    { provide: MAILER, inject: [CLOCK], useFactory: construirMailer },
  ],
  exports: [OutboxRepository, OutboxProcessor],
})
export class OutboxModule {}
