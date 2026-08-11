import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

/** Los trabajos que la bandeja sabe entregar (`plan.md` §5 de `specs/010`). */
export type TipoDeMensaje =
  | "identity.send-invitation"
  | "identity.send-password-reset"
  | "identity.notify-password-changed"
  | "identity.notify-account-status-changed";

export interface MensajeAEncolar {
  tipo: TipoDeMensaje;
  clubId?: string | null;
  payload: Prisma.InputJsonValue;
}

/**
 * Encola trabajos **dentro de la transacción que los origina** (P-11).
 *
 * Recibe el cliente de transacción, no lo abre: es lo que hace que «se creó el usuario» y «hay que
 * mandarle la invitación» sean el mismo hecho. Si el cambio se revierte, el mensaje se va con él;
 * si el proceso muere después del `COMMIT`, el mensaje ya está en la tabla y se enviará solo.
 */
@Injectable()
export class OutboxRepository {
  async encolar(tx: Prisma.TransactionClient, mensaje: MensajeAEncolar): Promise<void> {
    await tx.outboxMessage.create({
      data: {
        type: mensaje.tipo,
        payload: mensaje.payload,
        ...(mensaje.clubId === undefined || mensaje.clubId === null
          ? {}
          : { clubId: mensaje.clubId }),
      },
    });
  }
}
