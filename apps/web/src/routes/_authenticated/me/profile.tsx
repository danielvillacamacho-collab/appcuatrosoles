import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { RequestEmailChangeRequest, UpdateMeRequest } from "@polo/contracts";
import { Alert, Button, TextField } from "@polo/ui";
import { Pantalla } from "../../../features/me/components/Pantalla.js";
import { useSesion } from "../../../features/session/api/useSesion.js";
import { useEditarPerfil, usePedirCambioDeCorreo } from "../../../features/me/api/usePerfil.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * Mi perfil (T-130, HU-010-07).
 *
 * **Lo editable y lo que administra el club están separados visualmente**, que es requisito de
 * `docs/04`. No es cosmético: sin la distinción, alguien intenta corregir su categoría de
 * membresía, no puede, y concluye que la plataforma está rota. Aquí lo que no se edita ni siquiera
 * se presenta como un campo — es un dato con su etiqueta.
 */
export const Route = createFileRoute("/_authenticated/me/profile")({ component: MiPerfil });

function MiPerfil(): React.JSX.Element {
  const sesion = useSesion();
  const usuario = sesion.data;

  if (usuario === null || usuario === undefined) {
    return <Pantalla titulo={copy.perfil.titulo}>{null}</Pantalla>;
  }

  return (
    <Pantalla titulo={copy.perfil.titulo} descripcion={copy.perfil.descripcion}>
      <DatosDelClub
        nombre={usuario.fullName}
        categoria={usuario.membershipCategory?.name ?? copy.perfil.sinCategoria}
        roles={usuario.roles.map((rol) => copy.roles[rol.role] ?? rol.role)}
      />

      <MisDatos telefono={usuario.phone} />

      <CorreoDeAcceso email={usuario.email} pendiente={usuario.pendingEmail} />
    </Pantalla>
  );
}

/** Lo que se ve y no se toca. Se pinta como datos, no como campos deshabilitados. */
function DatosDelClub({
  nombre,
  categoria,
  roles,
}: {
  nombre: string;
  categoria: string;
  roles: string[];
}): React.JSX.Element {
  return (
    <section aria-labelledby="del-club" className="rounded-lg border border-sage bg-white/60 p-4">
      <h2 id="del-club" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
        {copy.perfil.soloLectura}
      </h2>

      <dl className="mt-3 flex flex-col gap-3">
        <Dato termino={copy.perfil.nombre} valor={nombre} />
        <Dato termino={copy.perfil.categoria} valor={categoria} />
        <Dato termino={copy.perfil.roles} valor={roles.length === 0 ? "—" : roles.join(" · ")} />
      </dl>
    </section>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-sm text-muted">{termino}</dt>
      <dd className="text-base font-medium">{valor}</dd>
    </div>
  );
}

/** Lo que sí cambia su titular: hoy el teléfono. La foto entra cuando haya dónde subirla. */
function MisDatos({ telefono }: { telefono: string | null }): React.JSX.Element {
  const editar = useEditarPerfil();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateMeRequest>({
    resolver: zodResolver(UpdateMeRequest),
    defaultValues: { phone: telefono ?? "" },
  });

  const enviar = handleSubmit(async (datos) => {
    // Un teléfono borrado se manda como `null` y no como `""`: son cosas distintas para el API —
    // «no tengo teléfono» frente a «tengo uno que es la cadena vacía».
    await editar.mutateAsync({ phone: datos.phone === "" ? null : datos.phone });
  });

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
        {copy.perfil.editable}
      </h2>

      {editar.isError && <Alert>{mensajeDeError(editar.error)}</Alert>}

      <TextField
        label={copy.perfil.telefono}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        error={errors.phone === undefined ? undefined : copy.perfil.telefonoInvalido}
        {...register("phone")}
      />

      <div className="flex items-center gap-3">
        {/* Deshabilitado mientras no haya cambios: un botón que se puede presionar y no hace nada
            enseña a desconfiar del botón. */}
        <Button type="submit" cargando={editar.isPending} disabled={!isDirty}>
          {editar.isPending ? copy.comun.guardando : copy.comun.guardar}
        </Button>
        {editar.isSuccess && !isDirty && (
          <p role="status" className="text-sm text-muted">
            {copy.comun.guardado}
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * El correo de acceso (HU-010-07, tercer criterio).
 *
 * **El correo anterior sigue valiendo hasta confirmar el nuevo**, y la pantalla lo dice: si no,
 * quien pidió el cambio cree que ya quedó, intenta entrar con el nuevo y no puede.
 */
function CorreoDeAcceso({
  email,
  pendiente,
}: {
  email: string;
  pendiente: string | null;
}): React.JSX.Element {
  const [abierto, setAbierto] = useState(false);
  const pedir = usePedirCambioDeCorreo();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestEmailChangeRequest>({
    resolver: zodResolver(RequestEmailChangeRequest),
    defaultValues: { newEmail: "", currentPassword: "" },
  });

  const enviar = handleSubmit(async (datos) => {
    await pedir.mutateAsync(datos);
    setAbierto(false);
  });

  return (
    <section aria-labelledby="correo" className="flex flex-col gap-3">
      <h2 id="correo" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
        {copy.perfil.correoDeAcceso}
      </h2>
      <p className="text-base font-medium">{email}</p>

      {pendiente !== null && (
        <p className="rounded-lg border border-jonquil bg-jonquil/10 px-4 py-3 text-sm">
          <strong>{copy.perfil.pendiente}</strong> {pendiente}
          <br />
          {copy.perfil.pendienteAyuda}
        </p>
      )}

      {abierto ? (
        <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
          {pedir.isError && <Alert>{mensajeDeError(pedir.error)}</Alert>}

          <TextField
            label={copy.perfil.correoNuevo}
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            error={errors.newEmail === undefined ? undefined : copy.ingreso.correoInvalido}
            {...register("newEmail")}
          />

          <TextField
            label={copy.perfil.contrasenaActual}
            type="password"
            autoComplete="current-password"
            ayuda={copy.perfil.contrasenaActualAyuda}
            error={errors.currentPassword === undefined ? undefined : copy.ingreso.contrasenaRequerida}
            {...register("currentPassword")}
          />

          <div className="flex flex-wrap gap-3">
            <Button type="submit" cargando={pedir.isPending}>
              {copy.perfil.enviarConfirmacion}
            </Button>
            <Button variante="texto" onClick={() => setAbierto(false)}>
              {copy.comun.cancelar}
            </Button>
          </div>
        </form>
      ) : (
        <Button variante="secundaria" onClick={() => setAbierto(true)}>
          {copy.perfil.cambiarCorreo}
        </Button>
      )}
    </section>
  );
}
