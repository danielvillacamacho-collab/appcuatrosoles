import { Global, Module } from "@nestjs/common";
import { MailerDeArchivo } from "../mailer/file-mailer.js";
import { MAILER } from "../mailer/mailer.port.js";
import { OutboxProcessor } from "./outbox.processor.js";
import { OutboxRepository } from "./outbox.repository.js";
import { OutboxScheduler } from "./outbox.scheduler.js";

/**
 * La bandeja de salida y su envío.
 *
 * El adaptador de correo se elige aquí y en ningún otro lugar: hoy `MailerDeArchivo`, que escribe a
 * disco para poder probar en local; mañana `SesMailer` (ADR-008), cuando exista la cuenta de AWS.
 * Es el único archivo que cambia.
 */
@Global()
@Module({
  providers: [
    OutboxRepository,
    OutboxProcessor,
    OutboxScheduler,
    { provide: MAILER, useClass: MailerDeArchivo },
  ],
  exports: [OutboxRepository, OutboxProcessor],
})
export class OutboxModule {}
