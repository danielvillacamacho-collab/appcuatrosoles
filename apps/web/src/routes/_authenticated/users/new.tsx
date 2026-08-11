import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { CreateUserRequest } from "@polo/contracts";
import { ROLE_SCOPES } from "@polo/domain";
import { Alert, Button, TextField } from "@polo/ui";
import { Pantalla } from "../../../components/Pantalla.js";
import { useSesion } from "../../../features/session/api/useSesion.js";
import { useCategorias, useOrganizaciones } from "../../../features/club/api/useCatalogos.js";
import { useCrearUsuario } from "../../../features/users/api/useUsuarios.js";
import { clubDelActor, rolesQuePuedeOtorgar } from "../../../features/users/roles-que-puede-otorgar.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * Crear o invitar (T-135, HU-010-01 y HU-010-02).
 *
 * **Con el correo alcanza.** El nombre es opcional porque el API admite la invitación ligera: la
 * persona completa sus datos al aceptar. Un formulario que exige seis campos para invitar a alguien
 * termina llenándose con «Pendiente» y «000».
 *
 * El selector de roles muestra **sólo lo que quien lo usa puede otorgar**, calculado con
 * `canAssignRole` — la misma función que aplica el API (R-010-04).
 */
export const Route = createFileRoute("/_authenticated/users/new")({ component: NuevoUsuario });

type Entrada = z.input<typeof CreateUserRequest>;

function NuevoUsuario(): React.JSX.Element {
  const sesion = useSesion();
  const crear = useCrearUsuario();
  const navegar = useNavigate();
  const organizaciones = useOrganizaciones();
  const categorias = useCategorias();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Entrada, unknown, CreateUserRequest>({
    resolver: zodResolver(CreateUserRequest),
    defaultValues: { email: "", fullName: "", roles: ["player"] },
  });

  const usuario = sesion.data;
  const clubId = usuario === null || usuario === undefined ? null : clubDelActor(usuario);
  const organizacionElegida = watch("organizationId");

  const disponibles =
    usuario === null || usuario === undefined
      ? []
      : [
          ...rolesQuePuedeOtorgar(usuario, { scope: "club", scopeId: clubId, clubId }),
          ...(organizacionElegida === undefined || organizacionElegida === ""
            ? []
            : rolesQuePuedeOtorgar(usuario, {
                scope: "organization",
                scopeId: organizacionElegida,
                clubId,
              })),
        ];

  const enviar = handleSubmit(async (datos) => {
    const creado = await crear.mutateAsync(datos);
    await navegar({ to: "/users/$userId", params: { userId: creado.id } });
  });

  return (
    <Pantalla titulo={copy.nuevoUsuario.titulo} descripcion={copy.nuevoUsuario.descripcion} volverA="/users">
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        {crear.isError && <Alert>{mensajeDeError(crear.error)}</Alert>}

        <TextField
          label={copy.nuevoUsuario.correo}
          type="email"
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="email"
          error={errors.email === undefined ? undefined : copy.ingreso.correoInvalido}
          {...register("email")}
        />

        <TextField
          label={copy.nuevoUsuario.nombre}
          autoComplete="off"
          ayuda={copy.nuevoUsuario.nombreAyuda}
          error={errors.fullName === undefined ? undefined : copy.invitacion.nombreInvalido}
          {...register("fullName", { setValueAs: enBlancoEsNada })}
        />

        <TextField
          label={copy.nuevoUsuario.telefono}
          type="tel"
          inputMode="tel"
          error={errors.phone === undefined ? undefined : copy.perfil.telefonoInvalido}
          {...register("phone", { setValueAs: enBlancoEsNada })}
        />

        <Seleccion
          etiqueta={copy.nuevoUsuario.categoria}
          opciones={(categorias.data ?? []).map((categoria) => ({
            valor: categoria.id,
            texto: categoria.name,
          }))}
          {...register("membershipCategoryId", { setValueAs: enBlancoEsNada })}
        />

        <Seleccion
          etiqueta={copy.nuevoUsuario.organizacion}
          ayuda={copy.nuevoUsuario.organizacionAyuda}
          opciones={(organizaciones.data ?? []).map((organizacion) => ({
            valor: organizacion.id,
            texto: organizacion.name,
          }))}
          {...register("organizationId", { setValueAs: enBlancoEsNada })}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{copy.nuevoUsuario.roles}</legend>
          <p className="text-sm text-muted">{copy.nuevoUsuario.rolesAyuda}</p>

          {disponibles.map((rol) => (
            <label key={rol} className="flex min-h-tap items-center gap-3 text-base">
              <input type="checkbox" value={rol} className="size-5 accent-brunswick" {...register("roles")} />
              {copy.roles[rol] ?? rol}
              {ROLE_SCOPES[rol].includes("organization") && !ROLE_SCOPES[rol].includes("club") && (
                <span className="text-sm text-muted">({copy.nuevoUsuario.organizacion})</span>
              )}
            </label>
          ))}
        </fieldset>

        <Button type="submit" cargando={crear.isPending}>
          {crear.isPending ? copy.nuevoUsuario.creando : copy.nuevoUsuario.crear}
        </Button>
      </form>
    </Pantalla>
  );
}

/** Un `<select>` con su etiqueta y su opción vacía. Ver la nota de `enBlancoEsNada`. */
function Seleccion({
  etiqueta,
  ayuda,
  opciones,
  ...resto
}: {
  etiqueta: string;
  ayuda?: string;
  opciones: { valor: string; texto: string }[];
} & React.SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{etiqueta}</span>
      <select
        className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
        defaultValue=""
        {...resto}
      >
        <option value="">—</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
      {ayuda !== undefined && <span className="text-sm text-muted">{ayuda}</span>}
    </label>
  );
}

/**
 * Un campo vacío en HTML es `""`, no `undefined`.
 *
 * Sin esto, un `<select>` sin elegir manda cadena vacía y el API la toma por un identificador de
 * categoría que no existe. Es el mismo detalle que en la pantalla de invitación, y aparece en cada
 * formulario con campos opcionales.
 */
function enBlancoEsNada(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() === "" ? undefined : (valor as string);
}
