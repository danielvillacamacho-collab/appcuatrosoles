import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Alert } from "@polo/ui";
import { useSesion } from "../features/session/api/useSesion.js";
import { mensajeDeError } from "../lib/error-message.js";
import { copy } from "../i18n/es-CO.js";

/**
 * Todo lo que exige sesión cuelga de aquí (T-125, `plan.md` §9.3.a).
 *
 * **La sesión se resuelve preguntando, no guardando.** El token vive en una cookie `httpOnly` que
 * JavaScript no puede leer, así que este guard espera a `GET /me`: un `401` significa que no hay
 * sesión —o que la revocaron desde otro dispositivo, o que suspendieron la cuenta, o el club— y
 * manda a `/login`. Un `isLoggedIn` en un store se habría desincronizado en los cuatro casos, y la
 * forma de enterarse habría sido una pantalla mostrándole a alguien datos que ya no le tocan.
 *
 * **La comprobación es de conveniencia, no de seguridad.** Quien quiera puede saltarse este guard
 * con las herramientas del navegador; lo que no puede saltarse es al API, que exige sesión y
 * permiso en cada endpoint. Este guard existe para que nadie vea una pantalla vacía llena de
 * errores, no para proteger datos.
 */
export const Route = createFileRoute("/_authenticated")({ component: Privado });

function Privado(): React.JSX.Element {
  const sesion = useSesion();
  const navegar = useNavigate();
  const sinSesion = sesion.isSuccess && sesion.data === null;

  useEffect(() => {
    if (sinSesion) {
      void navegar({
        to: "/login",
        // A dónde iba, para volver ahí después de entrar. Sin esto, quien abre un enlace directo
        // —el que le mandaron por WhatsApp— termina en el panel y tiene que buscarlo de nuevo.
        search: { redirigir: location.pathname },
        replace: true,
      });
    }
  }, [sinSesion, navegar]);

  if (sesion.isPending || sinSesion) {
    // Mientras se resuelve no se pinta nada del contenido privado. Pintarlo «optimistamente» y
    // esconderlo después es exactamente el parpadeo que deja ver, por un instante, lo que no se
    // debía ver.
    return <PantallaDeEspera />;
  }

  if (sesion.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream px-6 text-ink">
        <div className="w-full max-w-sm">
          <Alert>{mensajeDeError(sesion.error)}</Alert>
        </div>
      </main>
    );
  }

  return <Outlet />;
}

function PantallaDeEspera(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream text-muted">
      {/* `role="status"` para que un lector de pantalla anuncie la espera en vez de quedarse mudo. */}
      <p role="status">{copy.comun.cargando}</p>
    </main>
  );
}
