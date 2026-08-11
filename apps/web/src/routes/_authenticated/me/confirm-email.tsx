import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { Alert } from "@polo/ui";
import { Pantalla } from "../../../features/me/components/Pantalla.js";
import { useConfirmarCambioDeCorreo } from "../../../features/me/api/usePerfil.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * Confirmar el correo nuevo desde el enlace del correo (T-130, HU-010-07).
 *
 * **Está bajo el guard de sesión** porque el endpoint lo está: confirmar es un acto de la propia
 * cuenta. Quien abre el enlace sin sesión pasa por `/login` y vuelve aquí.
 *
 * No tiene botón: llegar con el token **es** la confirmación. Un «¿seguro que quieres confirmar?»
 * después de haber hecho clic en el correo es una pregunta que nadie sabe cómo contestar distinto.
 */
export const Route = createFileRoute("/_authenticated/me/confirm-email")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ConfirmarCorreo,
});

function ConfirmarCorreo(): React.JSX.Element {
  const { token } = Route.useSearch();
  const confirmar = useConfirmarCambioDeCorreo();
  // React 19 en modo estricto monta dos veces: sin esta guarda, el token —que es de un solo uso—
  // se gastaría en el primer montaje y el segundo mostraría «este enlace ya no sirve».
  const yaSeIntento = useRef(false);

  useEffect(() => {
    if (token !== undefined && token !== "" && !yaSeIntento.current) {
      yaSeIntento.current = true;
      confirmar.mutate({ token });
    }
  }, [token, confirmar]);

  return (
    <Pantalla titulo={copy.confirmarCorreo.titulo}>
      {token === undefined || token === "" ? (
        <Alert>{copy.confirmarCorreo.sinToken}</Alert>
      ) : confirmar.isError ? (
        <Alert>{mensajeDeError(confirmar.error)}</Alert>
      ) : confirmar.isSuccess ? (
        <p role="status" className="text-base">
          {copy.confirmarCorreo.listo}
        </p>
      ) : (
        <p role="status" className="text-muted">
          {copy.confirmarCorreo.confirmando}
        </p>
      )}
    </Pantalla>
  );
}
