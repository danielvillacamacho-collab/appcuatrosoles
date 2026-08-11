import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { SessionResponse } from "@polo/contracts";
import { Alert, Button } from "@polo/ui";
import { Pantalla } from "../../../features/me/components/Pantalla.js";
import {
  useCerrarSesion,
  useCerrarTodas,
  useSesiones,
} from "../../../features/me/api/useSesiones.js";
import { useFecha } from "../../../lib/fechas.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * Mis dispositivos (T-131, HU-010-05).
 *
 * Quien entra aquí suele estar preocupado —«¿alguien más tiene mi cuenta?»— así que la pantalla
 * responde eso primero: **cuál es esta sesión** y cuándo se usó cada una. La actual va marcada y
 * sin botón de cerrar: cerrarla desde la lista se siente como un accidente, y para eso está
 * «cerrar sesión» en el panel.
 */
export const Route = createFileRoute("/_authenticated/me/sessions")({ component: MisDispositivos });

function MisDispositivos(): React.JSX.Element {
  const sesiones = useSesiones();
  const cerrar = useCerrarSesion();
  const cerrarTodas = useCerrarTodas();
  const navegar = useNavigate();

  const cerrarTodo = async (): Promise<void> => {
    await cerrarTodas.mutateAsync(undefined);
    await navegar({ to: "/login" });
  };

  const otras = (sesiones.data ?? []).filter((sesion) => !sesion.current);

  return (
    <Pantalla titulo={copy.dispositivos.titulo} descripcion={copy.dispositivos.descripcion}>
      {sesiones.isError && <Alert>{mensajeDeError(sesiones.error)}</Alert>}
      {cerrar.isError && <Alert>{mensajeDeError(cerrar.error)}</Alert>}

      {sesiones.isPending && <p role="status">{copy.comun.cargando}</p>}

      <ul className="flex flex-col gap-3">
        {(sesiones.data ?? []).map((sesion) => (
          <li
            key={sesion.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sage bg-white/60 p-4"
          >
            <Detalle sesion={sesion} />

            {!sesion.current && (
              <Button
                variante="secundaria"
                onClick={() => void cerrar.mutateAsync(sesion.id)}
                cargando={cerrar.isPending && cerrar.variables === sesion.id}
              >
                {copy.dispositivos.cerrar}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {sesiones.isSuccess && otras.length === 0 && (
        <p className="text-muted">{copy.dispositivos.sinOtras}</p>
      )}

      <div className="mt-2 flex flex-col gap-2 border-t border-sage pt-6">
        <Button variante="secundaria" onClick={() => void cerrarTodo()} cargando={cerrarTodas.isPending}>
          {copy.dispositivos.cerrarTodas}
        </Button>
        <p className="text-sm text-muted">{copy.dispositivos.cerrarTodasAyuda}</p>
      </div>
    </Pantalla>
  );
}

function Detalle({ sesion }: { sesion: SessionResponse }): React.JSX.Element {
  const fecha = useFecha();

  return (
    <div className="min-w-0">
      {sesion.current && (
        <p className="text-sm font-bold uppercase tracking-[0.15em] text-brunswick">
          {copy.dispositivos.esta}
        </p>
      )}
      {/* El `user-agent` se muestra tal cual y truncado: traducirlo a «Chrome en un iPhone» sería
          adivinar, y quien mira esta lista buscando algo raro necesita el dato crudo. */}
      <p className="truncate text-base font-medium">{sesion.userAgent ?? "—"}</p>
      <p className="text-sm text-muted">
        {copy.dispositivos.ultimaVez}: {fecha(sesion.lastSeenAt)}
      </p>
      <p className="text-sm text-muted">
        {copy.dispositivos.desde} {fecha(sesion.createdAt)} · {copy.dispositivos.vence}{" "}
        {fecha(sesion.expiresAt)}
      </p>
      {sesion.rememberMe && <p className="text-sm text-muted">{copy.dispositivos.recordada}</p>}
    </div>
  );
}
