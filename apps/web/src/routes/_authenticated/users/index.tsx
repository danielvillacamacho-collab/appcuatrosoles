import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import type { UserResponse } from "@polo/contracts";
import { ROLE_NAMES } from "@polo/domain";
import { Alert, Button } from "@polo/ui";
import { Pantalla } from "../../../features/me/components/Pantalla.js";
import { useOrganizaciones } from "../../../features/club/api/useCatalogos.js";
import { urlDeExportacion, useUsuarios } from "../../../features/users/api/useUsuarios.js";
import { useFecha } from "../../../lib/fechas.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * El listado de usuarios (T-134, HU-010-08).
 *
 * **Los filtros viven en la URL**, no en un `useState`. Es lo que hace que «mándame el enlace de
 * los invitados que faltan por aceptar» funcione, que el botón «atrás» devuelva al filtro anterior
 * y que recargar no borre la búsqueda. En una pantalla de administración eso se nota el primer día.
 *
 * La exportación es **un enlace de descarga**, no una llamada de JavaScript: el navegador ya sabe
 * guardar un archivo que llega con `Content-Disposition`, y hacerlo a mano obligaría a manejar el
 * `blob` para conseguir lo mismo peor.
 */
export const Route = createFileRoute("/_authenticated/users/")({
  validateSearch: z.object({
    q: z.string().optional(),
    status: z.string().optional(),
    role: z.string().optional(),
    organizationId: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
  }),
  component: Usuarios,
});

function Usuarios(): React.JSX.Element {
  const filtros = Route.useSearch();
  const navegar = useNavigate({ from: Route.fullPath });
  const usuarios = useUsuarios(filtros);
  const organizaciones = useOrganizaciones();

  /** Cambiar un filtro **vuelve a la página 1**: si no, se filtra y se cae en una página vacía. */
  const cambiar = (campo: string, valor: string): void => {
    void navegar({
      search: (anterior) => ({ ...anterior, [campo]: valor === "" ? undefined : valor, page: undefined }),
    });
  };

  const pagina = usuarios.data?.page ?? 1;
  const limite = usuarios.data?.limit ?? 25;
  const total = usuarios.data?.total ?? 0;
  const desde = total === 0 ? 0 : (pagina - 1) * limite + 1;
  const hasta = Math.min(pagina * limite, total);

  return (
    <Pantalla titulo={copy.usuarios.titulo} descripcion={copy.usuarios.descripcion}>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/users/new"
          className="inline-flex min-h-tap items-center justify-center rounded-lg bg-coquelicot px-5 text-base font-semibold text-white"
        >
          {copy.usuarios.nuevo}
        </Link>

        {/* `reloadDocument` no hace falta: es un `<a>` normal a una ruta del API que responde un
            archivo. Lo hace el navegador, no el router. */}
        <a
          href={urlDeExportacion(filtros)}
          className="inline-flex min-h-tap items-center justify-center rounded-lg border border-brunswick px-5 text-base font-semibold text-brunswick"
        >
          {copy.usuarios.exportar}
        </a>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{copy.usuarios.buscar}</span>
          <input
            type="search"
            defaultValue={filtros.q ?? ""}
            onChange={(evento) => cambiar("q", evento.target.value)}
            className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <Filtro
            etiqueta={copy.usuarios.estado}
            valor={filtros.status ?? ""}
            onCambiar={(valor) => cambiar("status", valor)}
            opciones={Object.entries(copy.usuarios.estados).map(([valor, texto]) => ({ valor, texto }))}
          />

          <Filtro
            etiqueta={copy.usuarios.rol}
            valor={filtros.role ?? ""}
            onCambiar={(valor) => cambiar("role", valor)}
            opciones={ROLE_NAMES.map((rol) => ({ valor: rol, texto: copy.roles[rol] ?? rol }))}
          />

          <Filtro
            etiqueta={copy.usuarios.organizacion}
            valor={filtros.organizationId ?? ""}
            onCambiar={(valor) => cambiar("organizationId", valor)}
            opciones={(organizaciones.data ?? []).map((organizacion) => ({
              valor: organizacion.id,
              texto: organizacion.name,
            }))}
          />
        </div>
      </div>

      {usuarios.isError && <Alert>{mensajeDeError(usuarios.error)}</Alert>}
      {usuarios.isPending && <p role="status">{copy.comun.cargando}</p>}

      {usuarios.isSuccess && usuarios.data.items.length === 0 && (
        <p className="text-muted">{copy.usuarios.ninguno}</p>
      )}

      <ul className="flex flex-col gap-2">
        {(usuarios.data?.items ?? []).map((usuario) => (
          <li key={usuario.id}>
            <Fila usuario={usuario} />
          </li>
        ))}
      </ul>

      {total > 0 && (
        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-sage pt-4">
          <p className="text-sm text-muted">{copy.usuarios.rango(desde, hasta, total)}</p>

          <div className="flex gap-2">
            <Button
              variante="secundaria"
              disabled={pagina <= 1}
              onClick={() => void navegar({ search: (a) => ({ ...a, page: pagina - 1 }) })}
            >
              {copy.usuarios.anterior}
            </Button>
            <Button
              variante="secundaria"
              disabled={hasta >= total}
              onClick={() => void navegar({ search: (a) => ({ ...a, page: pagina + 1 }) })}
            >
              {copy.usuarios.siguiente}
            </Button>
          </div>
        </nav>
      )}
    </Pantalla>
  );
}

function Filtro({
  etiqueta,
  valor,
  onCambiar,
  opciones,
}: {
  etiqueta: string;
  valor: string;
  onCambiar: (valor: string) => void;
  opciones: { valor: string; texto: string }[];
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{etiqueta}</span>
      <select
        value={valor}
        onChange={(evento) => onCambiar(evento.target.value)}
        className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
      >
        {/* La opción vacía es «Todos» y manda cadena vacía, que el cliente omite del query: un
            `?status=` vacío filtraría por un estado inexistente y devolvería cero sin fallar. */}
        <option value="">{copy.usuarios.todos}</option>
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

function Fila({ usuario }: { usuario: UserResponse }): React.JSX.Element {
  const fecha = useFecha();

  return (
    <Link
      to="/users/$userId"
      params={{ userId: usuario.id }}
      className="flex min-h-tap flex-col justify-center rounded-lg border border-sage bg-white/60 p-4"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold text-ink">{usuario.fullName}</span>
        <Estado estado={usuario.status} />
      </span>
      <span className="text-sm text-muted">{usuario.email}</span>
      <span className="text-sm text-muted">
        {usuario.membershipCategory?.name ?? copy.usuarios.sinCategoria}
        {usuario.roles.length > 0 &&
          ` · ${usuario.roles.map((rol) => copy.roles[rol.role] ?? rol.role).join(", ")}`}
      </span>

      {/* La fecha de envío responde «¿le llegó?»: sin ella, «invitado» no distingue una invitación
          de ayer de una de hace tres semanas y se reenvía a ciegas (HU-010-01). */}
      {usuario.invitationSentAt !== null && (
        <span className="text-sm text-muted">
          {copy.usuarios.invitadoDesde} {fecha(usuario.invitationSentAt)}
        </span>
      )}
    </Link>
  );
}

export function Estado({ estado }: { estado: string }): React.JSX.Element {
  const colores: Record<string, string> = {
    active: "bg-brunswick text-bone",
    invited: "bg-jonquil text-ink",
    suspended: "bg-coquelicot text-white",
    archived: "bg-sage text-ink",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${colores[estado] ?? "bg-sage"}`}>
      {copy.usuarios.estados[estado] ?? estado}
    </span>
  );
}
