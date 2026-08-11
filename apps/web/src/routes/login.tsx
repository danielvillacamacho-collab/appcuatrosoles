import { zodResolver } from "@hookform/resolvers/zod";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { LoginRequest } from "@polo/contracts";
import type { z } from "zod";
import { Alert, Button, TextField } from "@polo/ui";
import { useClub } from "../features/club/api/useClub.js";
import { useLogin } from "../features/auth/api/useLogin.js";
import { mensajeDeError } from "../lib/error-message.js";
import { PantallaDeEntrada } from "../components/Pantalla.js";
import { copy } from "../i18n/es-CO.js";

/**
 * La pantalla de ingreso (T-124, HU-010-04).
 *
 * Es la primera que ve todo el mundo y la única que ve quien todavía no entró, así que carga con
 * dos cosas que no se ven pero se notan:
 *
 * 1. **Dice de qué club es.** Quien abre `lospinos.polo.app` tiene que reconocerlo antes de
 *    escribir su contraseña. Un club sale del `Host` y nunca de un parámetro (`ADR-013`).
 * 2. **No distingue «ese correo no existe» de «esa contraseña está mal».** El API responde un solo
 *    error a propósito (R-010-07, P-12) y la interfaz respeta esa decisión: separar los mensajes
 *    aquí convertiría esta pantalla en un buscador de socios del club.
 */
export const Route = createFileRoute("/login")({ component: Ingreso });

/**
 * Dos tipos y no uno, porque el esquema **transforma**: `rememberMe` tiene default, así que lo que
 * el formulario tiene mientras se llena (`z.input`) no es lo que sale validado (`LoginRequest`).
 * Confundirlos hace que el campo con default se declare obligatorio en el formulario.
 */
type Entrada = z.input<typeof LoginRequest>;

function Ingreso(): React.JSX.Element {
  const club = useClub();
  const login = useLogin();
  const navegar = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Entrada, unknown, LoginRequest>({
    // El **mismo** esquema que valida el API (`docs/04` §5): un correo que aquí pasa y allá no
    // sería un error que sólo aparece después de mandar la contraseña.
    resolver: zodResolver(LoginRequest),
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  const enviar = handleSubmit(async (datos) => {
    await login.mutateAsync(datos);
    await navegar({ to: "/" });
  });

  return (
    <PantallaDeEntrada>
        <header className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
            {copy.app.title}
          </p>
          {/* Mientras carga no se muestra un esqueleto: el nombre del club aparece cuando llega, y
              un salto de layout en la primera pantalla se siente peor que un título que tarda. */}
          <h1 className="mt-1 text-2xl font-bold">{club.data?.name ?? copy.ingreso.titulo}</h1>
          <p className="mt-2 text-muted">{copy.ingreso.subtitulo}</p>
        </header>

        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          {login.isError && <Alert>{mensajeDeError(login.error)}</Alert>}

          <TextField
            label={copy.ingreso.correo}
            type="email"
            // Los teclados de celular capitalizan y autocorrigen: en un correo eso produce
            // «María@…» y un rechazo que la persona no entiende, porque ve lo que escribió bien.
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            inputMode="email"
            error={errors.email === undefined ? undefined : copy.ingreso.correoInvalido}
            {...register("email")}
          />

          <TextField
            label={copy.ingreso.contrasena}
            type="password"
            autoComplete="current-password"
            error={errors.password === undefined ? undefined : copy.ingreso.contrasenaRequerida}
            {...register("password")}
          />

          <label className="flex min-h-tap items-center gap-3 text-base">
            <input type="checkbox" className="size-5 accent-brunswick" {...register("rememberMe")} />
            {copy.ingreso.recordarme}
          </label>

          <Button type="submit" cargando={login.isPending}>
            {login.isPending ? copy.ingreso.entrando : copy.ingreso.entrar}
          </Button>
        </form>

        <p className="mt-6 text-center">
          <Link to="/forgot-password" className="text-brunswick underline underline-offset-4">
            {copy.ingreso.olvide}
          </Link>
        </p>
    </PantallaDeEntrada>
  );
}
