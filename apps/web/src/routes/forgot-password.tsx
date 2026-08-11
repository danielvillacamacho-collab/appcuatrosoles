import { zodResolver } from "@hookform/resolvers/zod";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { ForgotPasswordRequest } from "@polo/contracts";
import { Alert, Button, TextField } from "@polo/ui";
import { useOlvideMiContrasena } from "../features/auth/api/useOlvideMiContrasena.js";
import { mensajeDeError } from "../lib/error-message.js";
import { PantallaDeEntrada } from "../components/Pantalla.js";
import { copy } from "../i18n/es-CO.js";

/**
 * Pedir el enlace para restablecer la contraseña (HU-010-06).
 *
 * Va con T-124 y no con T-129 porque es la salida de emergencia **de la pantalla de ingreso**:
 * dejarla para después habría significado un enlace muerto en la primera pantalla del producto.
 * Usar el enlace —`/reset-password`— sí es T-129.
 *
 * **Después de enviar, la pantalla dice siempre lo mismo.** No «te enviamos un correo» cuando la
 * cuenta existe y otra cosa cuando no: eso convertiría esta pantalla en un buscador de socios del
 * club (R-010-07, P-12). El API ya responde igual en los dos casos; la interfaz no lo deshace.
 */
export const Route = createFileRoute("/forgot-password")({ component: Olvide });

function Olvide(): React.JSX.Element {
  const pedir = useOlvideMiContrasena();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordRequest),
    defaultValues: { email: "" },
  });

  const enviar = handleSubmit(async (datos) => {
    await pedir.mutateAsync(datos);
  });

  return (
    <PantallaDeEntrada>
        <h1 className="text-2xl font-bold">{copy.olvide.titulo}</h1>

        {pedir.isSuccess ? (
          <p className="mt-4 text-base">{copy.olvide.listo}</p>
        ) : (
          <>
            <p className="mt-2 text-muted">{copy.olvide.subtitulo}</p>

            <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
              {pedir.isError && <Alert>{mensajeDeError(pedir.error)}</Alert>}

              <TextField
                label={copy.olvide.correo}
                type="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                inputMode="email"
                error={errors.email === undefined ? undefined : copy.ingreso.correoInvalido}
                {...register("email")}
              />

              <Button type="submit" cargando={pedir.isPending}>
                {pedir.isPending ? copy.olvide.enviando : copy.olvide.enviar}
              </Button>
            </form>
          </>
        )}

        <p className="mt-6 text-center">
          <Link to="/login" className="text-brunswick underline underline-offset-4">
            {copy.olvide.volver}
          </Link>
        </p>
    </PantallaDeEntrada>
  );
}
