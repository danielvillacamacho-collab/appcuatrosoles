import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { MeResponse } from "@polo/contracts";
import { Button } from "@polo/ui";
import { useSesion } from "../../features/session/api/useSesion.js";
import { useSalir } from "../../features/auth/api/useSalir.js";
import { useClub } from "../../features/club/api/useClub.js";
import { copy } from "../../i18n/es-CO.js";

/**
 * El panel propio (T-127, HU-010-04 «accede a su panel según sus roles»).
 *
 * Es la pantalla que cierra el recorrido de T-100 y la que contesta, de un vistazo, las tres cosas
 * que alguien quiere saber al entrar: **quién soy aquí, qué puedo hacer, y a dónde voy**.
 *
 * El acceso a la administración **se muestra según los roles, y eso es comodidad y no seguridad**:
 * esconder un enlace no protege nada —el API decide en cada petición (`docs/06` §4)— pero ofrecerle
 * a un jugador «Usuarios del club» para después responderle `403` es mentirle.
 */
export const Route = createFileRoute("/_authenticated/")({ component: Panel });

/** Quién ve la administración de usuarios. Se pregunta por **todos** sus roles, no por el primero. */
function administraGente(usuario: MeResponse): boolean {
  return usuario.roles.some((rol) =>
    ["superadmin", "club_admin", "organization_admin"].includes(rol.role),
  );
}

function Panel(): React.JSX.Element {
  const sesion = useSesion();
  const club = useClub();
  const salir = useSalir();
  const navegar = useNavigate();
  const usuario = sesion.data;

  // El guard de `_authenticated` ya garantizó que hay sesión; este `null` es sólo para el tipo.
  if (usuario === null || usuario === undefined) {
    return <></>;
  }

  const cerrar = async (): Promise<void> => {
    await salir.mutateAsync(undefined);
    await navegar({ to: "/login" });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
          {club.data?.name ?? copy.app.title}
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          {copy.panel.saludo}, {usuario.fullName}
        </h1>
        <p className="text-muted">{usuario.email}</p>
      </header>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      <section aria-labelledby="roles">
        <h2 id="roles" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
          {copy.panel.tusRoles}
        </h2>

        {usuario.roles.length === 0 ? (
          // Le pasa a quien acaba de aceptar la invitación y el club todavía no le asignó nada.
          // Decirle qué hacer es mejor que dejarle un espacio en blanco que parece un error.
          <p className="mt-2 text-base">{copy.panel.sinRoles}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {usuario.roles.map((rol) => (
              <li
                key={`${rol.role}-${rol.scopeId ?? "plataforma"}`}
                className="rounded-full bg-brunswick px-3 py-1 text-sm font-semibold text-bone"
              >
                {copy.roles[rol.role] ?? rol.role}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="membresia">
        <h2 id="membresia" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
          {copy.panel.categoria}
        </h2>
        <p className="mt-2 text-base">
          {usuario.membershipCategory?.name ?? copy.panel.sinCategoria}
        </p>
      </section>

      {usuario.organizations.length > 0 && (
        <section aria-labelledby="organizaciones">
          <h2
            id="organizaciones"
            className="text-sm font-semibold uppercase tracking-[0.15em] text-muted"
          >
            {copy.panel.organizaciones}
          </h2>
          <ul className="mt-2 list-inside list-disc text-base">
            {usuario.organizations.map((organizacion) => (
              <li key={organizacion.id}>{organizacion.name}</li>
            ))}
          </ul>
        </section>
      )}

      </div>

      <div className="grid gap-8 sm:grid-cols-2">
      <nav aria-labelledby="mis-cosas">
        <h2 id="mis-cosas" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
          {copy.panel.misCosas}
        </h2>
        <ul className="mt-2 flex flex-col">
          <li>
            <Acceso a="/me/profile">{copy.panel.miPerfil}</Acceso>
          </li>
          <li>
            <Acceso a="/me/sessions">{copy.panel.misDispositivos}</Acceso>
          </li>
          <li>
            <Acceso a="/me/notifications">{copy.panel.misAvisos}</Acceso>
          </li>
          <li>
            <Acceso a="/me/dependents">{copy.panel.misPerfilesACargo}</Acceso>
          </li>
          <li>
            <Acceso a="/calendar">{copy.panel.calendario}</Acceso>
          </li>
        </ul>
      </nav>

      {administraGente(usuario) && (
        <nav aria-labelledby="administracion">
          <h2
            id="administracion"
            className="text-sm font-semibold uppercase tracking-[0.15em] text-muted"
          >
            {copy.panel.administracion}
          </h2>
          <ul className="mt-2 flex flex-col">
            <li>
              <Acceso a="/users">{copy.panel.usuarios}</Acceso>
            </li>
            <li>
              <Acceso a="/fields">{copy.panel.canchas}</Acceso>
            </li>
          </ul>
        </nav>
      )}

      </div>

      {/* En el celular el botón se va al fondo de la pantalla, que es donde el pulgar lo espera. En
          un monitor eso lo dejaría solo al final de mucho espacio vacío, así que ahí va detrás del
          contenido. */}
      <footer className="mt-auto pt-4 sm:mt-4">
        <Button variante="secundaria" onClick={() => void cerrar()} cargando={salir.isPending}>
          {copy.comun.salir}
        </Button>
      </footer>
    </main>
  );
}

/**
 * Un acceso de la lista.
 *
 * `min-h-tap` porque esto se toca con el pulgar (`docs/04` §2), y la lista completa se muestra a
 * todo el mundo: «perfiles a cargo» vacío es una respuesta útil —«no tienes»— y esconderlo obligaría
 * a consultar los dependientes de todos sólo para decidir si pintar un enlace.
 */
function Acceso({
  a,
  children,
}: {
  a: "/me/profile" | "/me/sessions" | "/me/notifications" | "/me/dependents" | "/users" | "/calendar" | "/fields";
  children: string;
}): React.JSX.Element {
  return (
    <Link
      to={a}
      className="flex min-h-tap items-center border-b border-sage/60 text-base font-medium text-brunswick"
    >
      {children}
    </Link>
  );
}
