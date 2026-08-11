import { createFileRoute } from "@tanstack/react-router";
import type { NotificationPreferenceResponse } from "@polo/contracts";
import { Alert } from "@polo/ui";
import { Pantalla } from "../../../components/Pantalla.js";
import { useAvisos, useCambiarAvisos } from "../../../features/me/api/useAvisos.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * Mis avisos (T-132, T-091).
 *
 * **Los que no se pueden apagar se muestran en gris con su motivo, no se esconden.** Esconderlos
 * haría creer que el sistema no los manda, y quien recibiera «tu contraseña cambió» después de
 * haber «apagado todo» pensaría que la plataforma ignora sus preferencias. Verlos deshabilitados
 * dice la verdad: existen, llegan siempre, y hay una razón.
 *
 * Hoy los cuatro avisos del módulo son inevitables, así que esta pantalla no tiene nada que
 * apagar todavía. El primer interruptor real llega con las prácticas (`specs/050`).
 */
export const Route = createFileRoute("/_authenticated/me/notifications")({ component: MisAvisos });

function MisAvisos(): React.JSX.Element {
  const avisos = useAvisos();
  const cambiar = useCambiarAvisos();

  return (
    <Pantalla titulo={copy.avisos.titulo} descripcion={copy.avisos.descripcion}>
      {avisos.isError && <Alert>{mensajeDeError(avisos.error)}</Alert>}
      {cambiar.isError && <Alert>{mensajeDeError(cambiar.error)}</Alert>}
      {avisos.isPending && <p role="status">{copy.comun.cargando}</p>}

      <ul className="flex flex-col gap-3">
        {(avisos.data ?? []).map((aviso) => (
          <li key={aviso.type}>
            <Interruptor
              aviso={aviso}
              onCambiar={(enabled) =>
                void cambiar.mutateAsync({ preferences: [{ type: aviso.type, enabled }] })
              }
            />
          </li>
        ))}
      </ul>
    </Pantalla>
  );
}

function Interruptor({
  aviso,
  onCambiar,
}: {
  aviso: NotificationPreferenceResponse;
  onCambiar: (enabled: boolean) => void;
}): React.JSX.Element {
  const bloqueado = !aviso.canDisable;

  return (
    <label
      className={`flex min-h-tap items-start gap-3 rounded-lg border p-4 ${
        bloqueado ? "border-sage/60 bg-white/30 text-muted" : "border-sage bg-white/60"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1 size-5 accent-brunswick"
        checked={aviso.enabled}
        disabled={bloqueado}
        onChange={(evento) => onCambiar(evento.target.checked)}
      />

      <span>
        {/* El nombre legible sale de `i18n`; si llega un tipo que esta versión no conoce —porque el
            API es más nuevo— se muestra el identificador en vez de una fila en blanco. */}
        <span className="block text-base font-medium">
          {copy.avisos.tipos[aviso.type] ?? aviso.type}
        </span>
        {bloqueado && (
          <span className="block text-sm">
            {copy.avisos.inevitable}. {copy.avisos.inevitableAyuda}
          </span>
        )}
      </span>
    </label>
  );
}
