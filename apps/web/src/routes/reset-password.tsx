import { zodResolver } from "@hookform/resolvers/zod";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ResetPasswordRequest } from "@polo/contracts";
import { validatePassword } from "@polo/domain";
import { Alert, Button, TextField } from "@polo/ui";
import { useRestablecerContrasena } from "../features/auth/api/useRestablecerContrasena.js";
import { mensajeDeError } from "../lib/error-message.js";
import { PantallaDeEntrada } from "../components/Pantalla.js";
import { copy } from "../i18n/es-CO.js";
import { salioBien } from "../lib/mutacion.js";

/**
 * Definir una contraseña nueva con el enlace del correo (T-129, HU-010-06).
 *
 * **Al terminar no queda dentro**: el API revoca todas las sesiones al cambiar la contraseña
 * (R-010-09), incluida la de este navegador si la había. La pantalla lo dice en vez de mandar al
 * panel y que la persona se encuentre con un `401` que no se explica.
 */
export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: Restablecer,
});

/** El contrato del API más la política del dominio. Ver la nota de `accept-invitation`. */
const Formulario = ResetPasswordRequest.refine(
  (datos) => validatePassword(datos.newPassword).ok,
  { message: "no cumple la política", path: ["newPassword"] },
);

type Entrada = z.input<typeof Formulario>;
type Salida = z.output<typeof Formulario>;

function Restablecer(): React.JSX.Element {
  const { token } = Route.useSearch();
  const restablecer = useRestablecerContrasena();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Entrada, unknown, Salida>({
    resolver: zodResolver(Formulario),
    defaultValues: { token: token ?? "", newPassword: "", newPasswordConfirmation: "" },
  });

  const enviar = handleSubmit(async (datos) => {
    if (!(await salioBien(restablecer.mutateAsync(datos)))) {
      return;
    }
  });

  return (
    <PantallaDeEntrada>
        <h1 className="text-2xl font-bold">{copy.restablecer.titulo}</h1>

        {token === undefined || token === "" ? (
          <Alert>{copy.restablecer.sinToken}</Alert>
        ) : restablecer.isSuccess ? (
          <>
            <p className="mt-4 text-base">{copy.restablecer.listo}</p>
            <p className="mt-6 text-center">
              <Link to="/login" className="text-brunswick underline underline-offset-4">
                {copy.restablecer.irAIngresar}
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-muted">{copy.restablecer.subtitulo}</p>

            <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
              {restablecer.isError && <Alert>{mensajeDeError(restablecer.error)}</Alert>}

              <TextField
                label={copy.restablecer.contrasena}
                type="password"
                autoComplete="new-password"
                ayuda={copy.errores.PASSWORD_POLICY}
                error={errors.newPassword === undefined ? undefined : copy.errores.PASSWORD_POLICY}
                {...register("newPassword")}
              />

              <TextField
                label={copy.restablecer.confirmacion}
                type="password"
                autoComplete="new-password"
                error={
                  errors.newPasswordConfirmation === undefined
                    ? undefined
                    : copy.invitacion.noCoinciden
                }
                {...register("newPasswordConfirmation")}
              />

              <Button type="submit" cargando={restablecer.isPending}>
                {restablecer.isPending ? copy.restablecer.guardando : copy.restablecer.guardar}
              </Button>
            </form>
          </>
        )}
    </PantallaDeEntrada>
  );
}
