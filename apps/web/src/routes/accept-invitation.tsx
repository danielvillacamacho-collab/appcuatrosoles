import { zodResolver } from "@hookform/resolvers/zod";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AcceptInvitationRequest } from "@polo/contracts";
import { validatePassword } from "@polo/domain";
import { Alert, Button, TextField } from "@polo/ui";
import { useAceptarInvitacion } from "../features/auth/api/useAceptarInvitacion.js";
import { useClub } from "../features/club/api/useClub.js";
import { mensajeDeError } from "../lib/error-message.js";
import { copy } from "../i18n/es-CO.js";

/**
 * Definir la primera contraseña con el enlace de invitación (T-126, HU-010-02).
 *
 * Dos cosas la hacen distinta de un formulario cualquiera:
 *
 * 1. **La política de contraseñas se comprueba aquí, con la misma función del dominio que usa el
 *    API** (`validatePassword`). No es duplicar la regla: es *la* regla, importada. Sin esto, la
 *    persona escribe una contraseña, la confirma, presiona el botón y recién ahí le dicen que no
 *    sirve — y la que ya escribió dos veces se pierde.
 * 2. **Pide nombre y teléfono si el club invitó sólo con el correo.** Es la variante ligera de
 *    HU-010-02: el club captura un correo y la persona completa lo suyo. Son opcionales porque el
 *    API sólo los toma si el club no los puso ya.
 */
export const Route = createFileRoute("/accept-invitation")({
  // El token viaja en la URL. Si no viene, la pantalla lo dice en vez de mostrar un formulario que
  // no puede funcionar.
  validateSearch: z.object({ token: z.string().optional() }),
  component: AceptarInvitacion,
});

/**
 * El formulario usa **el contrato completo, con el token adentro**, y no una versión recortada.
 *
 * No es por comodidad: el esquema del API compara las dos contraseñas con un `.refine()`, y
 * recortarlo lo perdería —`.omit()` ni siquiera existe sobre un esquema refinado—. Usándolo entero,
 * «las dos contraseñas no coinciden» aparece al instante y no después de un viaje al servidor. El
 * token viene de la URL y entra como valor por defecto.
 */
/**
 * El contrato del API **más la política de contraseñas del dominio**, dentro del mismo esquema.
 *
 * Tiene que ir aquí y no como regla `validate` de un campo: cuando `useForm` usa un `resolver`,
 * las reglas por campo **se ignoran por completo**. Puestas ahí parecen funcionar —el código se
 * lee bien, nada falla— y la contraseña corta llega hasta el servidor. Lo destapó el test.
 *
 * `validatePassword` es la misma función que aplica el API (`packages/domain`), importada. No es
 * duplicar la regla: es la regla.
 */
const Formulario = AcceptInvitationRequest.refine(
  (datos) => validatePassword(datos.newPassword).ok,
  { message: "no cumple la política", path: ["newPassword"] },
);

type Entrada = z.input<typeof Formulario>;
type Salida = z.output<typeof Formulario>;

function AceptarInvitacion(): React.JSX.Element {
  const { token } = Route.useSearch();
  const club = useClub();
  const aceptar = useAceptarInvitacion();
  const navegar = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Entrada, unknown, Salida>({
    resolver: zodResolver(Formulario),
    // `defaultValues` y **no** `values`: este último resincroniza el formulario en cada render, y
    // con un objeto literal nuevo cada vez eso borraría lo que la persona está escribiendo.
    defaultValues: { token: token ?? "", newPassword: "", newPasswordConfirmation: "" },
  });

  const enviar = handleSubmit(async (datos) => {
    await aceptar.mutateAsync(datos);
    // El API activa la cuenta pero no abre sesión: quien acaba de definir una contraseña debería
    // probarla de una vez, no descubrir mañana que escribió otra cosa.
    await navegar({ to: "/login" });
  });

  if (token === undefined || token === "") {
    return (
      <Marco titulo={copy.invitacion.titulo}>
        <Alert>{copy.invitacion.sinToken}</Alert>
      </Marco>
    );
  }

  return (
    <Marco titulo={club.data?.name ?? copy.invitacion.titulo}>
      <p className="text-muted">{copy.invitacion.subtitulo}</p>

      <form onSubmit={enviar} noValidate className="mt-6 flex flex-col gap-4">
        {aceptar.isError && <Alert>{mensajeDeError(aceptar.error)}</Alert>}

        <TextField
          label={copy.invitacion.nombre}
          autoComplete="name"
          ayuda={copy.invitacion.nombreAyuda}
          error={errors.fullName === undefined ? undefined : copy.invitacion.nombreInvalido}
          {...register("fullName", { setValueAs: enBlancoEsNada })}
        />

        <TextField
          label={copy.invitacion.telefono}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          error={errors.phone === undefined ? undefined : copy.invitacion.telefonoInvalido}
          {...register("phone", { setValueAs: enBlancoEsNada })}
        />

        <TextField
          label={copy.invitacion.contrasena}
          type="password"
          autoComplete="new-password"
          ayuda={copy.errores.PASSWORD_POLICY}
          error={errors.newPassword === undefined ? undefined : copy.errores.PASSWORD_POLICY}
          {...register("newPassword")}
        />

        <TextField
          label={copy.invitacion.confirmacion}
          type="password"
          autoComplete="new-password"
          error={
            errors.newPasswordConfirmation === undefined
              ? undefined
              : copy.invitacion.noCoinciden
          }
          {...register("newPasswordConfirmation")}
        />

        <Button type="submit" cargando={aceptar.isPending}>
          {aceptar.isPending ? copy.invitacion.guardando : copy.invitacion.guardar}
        </Button>
      </form>

      <p className="mt-6 text-center">
        <Link to="/login" className="text-brunswick underline underline-offset-4">
          {copy.invitacion.yaTengoCuenta}
        </Link>
      </p>
    </Marco>
  );
}

/**
 * Un campo de texto vacío en HTML es `""`, no `undefined`.
 *
 * Sin esto, dejar en blanco un campo **opcional** con `min(1)` lo hace fallar la validación: el
 * formulario se niega a enviarse y señala como incorrecto un campo que nadie tenía que llenar.
 * Es el fallo más aburrido posible y aparece en cada formulario con campos opcionales.
 */
function enBlancoEsNada(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() === "" ? undefined : (valor as string);
}

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-6 py-10 text-ink">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold">{titulo}</h1>
        {children}
      </div>
    </main>
  );
}
