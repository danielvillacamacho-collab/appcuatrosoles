import { createFileRoute } from "@tanstack/react-router";
import type { AuditEntryResponse, UserResponse } from "@polo/contracts";
import { Alert, Button } from "@polo/ui";
import { Pantalla } from "../../../components/Pantalla.js";
import { useSesion } from "../../../features/session/api/useSesion.js";
import {
  useAccionDeCuenta,
  useAuditoriaDe,
  useRetirarRol,
  useUsuario,
  type AccionDeCuenta,
} from "../../../features/users/api/useUsuarios.js";
import { HandicapDePersona } from "../../../features/handicaps/HandicapDePersona.js";
import { Estado } from "./index.js";
import { useFecha } from "../../../lib/fechas.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * La ficha de un usuario (T-136, HU-010-08).
 *
 * Reúne lo que un administrador necesita para decidir: quién es, en qué estado está, qué roles
 * tiene, y **qué se le ha hecho a esta persona** — el historial de auditoría acotado a ella, que es
 * la pregunta que aparece meses después («¿quién la suspendió, y cuándo?»).
 *
 * Las acciones que el API rechazaría **no se ofrecen**: sobre la propia cuenta no hay botones
 * (R-010-05), y «reactivar» sólo aparece si está suspendida. Un botón que existe para responder un
 * error es una promesa incumplida.
 */
export const Route = createFileRoute("/_authenticated/users/$userId")({ component: Ficha });

function Ficha(): React.JSX.Element {
  const { userId } = Route.useParams();
  const usuario = useUsuario(userId);
  const sesion = useSesion();

  return (
    <Pantalla titulo={usuario.data?.fullName ?? copy.fichaUsuario.cargando} volverA="/users">
      {usuario.isError && <Alert>{mensajeDeError(usuario.error)}</Alert>}
      {usuario.isPending && <p role="status">{copy.comun.cargando}</p>}

      {usuario.isSuccess && (
        <Contenido usuario={usuario.data} esMiCuenta={sesion.data?.userAccountId === usuario.data.id} />
      )}
    </Pantalla>
  );
}

function Contenido({
  usuario,
  esMiCuenta,
}: {
  usuario: UserResponse;
  esMiCuenta: boolean;
}): React.JSX.Element {
  const fecha = useFecha();
  const accion = useAccionDeCuenta(usuario.id);
  const retirar = useRetirarRol(usuario.id);
  const auditoria = useAuditoriaDe(usuario.personId);

  /** Qué se puede hacer según el estado. Fuera de esto, no hay botón. */
  const acciones: { accion: AccionDeCuenta; texto: string; variante?: "secundaria" }[] =
    usuario.status === "active"
      ? [
          { accion: "suspend", texto: copy.fichaUsuario.suspender },
          { accion: "archive", texto: copy.fichaUsuario.archivar, variante: "secundaria" },
        ]
      : usuario.status === "suspended"
        ? [
            { accion: "reactivate", texto: copy.fichaUsuario.reactivar },
            { accion: "archive", texto: copy.fichaUsuario.archivar, variante: "secundaria" },
          ]
        : usuario.status === "archived"
          ? [{ accion: "restore", texto: copy.fichaUsuario.restaurar }]
          : [{ accion: "invite", texto: copy.fichaUsuario.reinvitar }];

  return (
    <>
      <header>
        <p className="flex flex-wrap items-center gap-2">
          <Estado estado={usuario.status} />
          <span className="text-muted">{usuario.email}</span>
        </p>
        {usuario.invitationSentAt !== null && (
          <p className="text-sm text-muted">
            {copy.usuarios.invitadoDesde} {fecha(usuario.invitationSentAt)}
          </p>
        )}
      </header>

      <dl className="flex flex-col gap-3 rounded-lg border border-sage bg-white/60 p-4">
        <Dato termino={copy.fichaUsuario.telefono} valor={usuario.phone ?? "—"} />
        <Dato
          termino={copy.fichaUsuario.categoria}
          valor={usuario.membershipCategory?.name ?? copy.usuarios.sinCategoria}
        />
        <Dato
          termino={copy.fichaUsuario.organizaciones}
          valor={
            usuario.organizations.length === 0
              ? "—"
              : usuario.organizations.map((organizacion) => organizacion.name).join(", ")
          }
        />
      </dl>

      <HandicapDePersona personId={usuario.personId} />

      <div className="grid gap-6 md:grid-cols-2">
      <section aria-labelledby="roles">
        <h2 id="roles" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
          {copy.fichaUsuario.roles}
        </h2>

        {retirar.isError && <Alert>{mensajeDeError(retirar.error)}</Alert>}

        <ul className="mt-2 flex flex-col gap-2">
          {usuario.roles.map((rol) => (
            <li
              key={rol.id}
              className="flex min-h-tap flex-wrap items-center justify-between gap-2 rounded-lg border border-sage bg-white/60 px-4 py-2"
            >
              <span className="font-medium">{copy.roles[rol.role] ?? rol.role}</span>
              {!esMiCuenta && (
                <Button
                  variante="texto"
                  onClick={() => void retirar.mutateAsync(rol.id)}
                  cargando={retirar.isPending && retirar.variables === rol.id}
                >
                  {copy.fichaUsuario.retirar}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="acciones">
        <h2 id="acciones" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
          {copy.fichaUsuario.acciones}
        </h2>

        {accion.isError && <Alert>{mensajeDeError(accion.error)}</Alert>}
        {accion.isSuccess && accion.variables === "invite" && (
          <p role="status" className="mt-2 text-sm">
            {copy.fichaUsuario.reinvitada}
          </p>
        )}

        {esMiCuenta ? (
          // Nadie se suspende ni se archiva a sí mismo (R-010-05). El API lo rechaza igual; aquí no
          // se ofrece, para no prometer algo que va a fallar.
          <p className="mt-2 text-muted">{copy.fichaUsuario.esTuCuenta}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-3">
            {acciones.map((boton) => (
              <Button
                key={boton.accion}
                variante={boton.variante ?? "primaria"}
                onClick={() => void accion.mutateAsync(boton.accion)}
                cargando={accion.isPending && accion.variables === boton.accion}
              >
                {boton.texto}
              </Button>
            ))}
          </div>
        )}
      </section>

      </div>

      <section aria-labelledby="historial">
        <h2 id="historial" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
          {copy.fichaUsuario.historial}
        </h2>

        {auditoria.isSuccess && auditoria.data.length === 0 && (
          <p className="mt-2 text-muted">{copy.fichaUsuario.sinHistorial}</p>
        )}

        <ul className="mt-2 flex flex-col gap-2">
          {(auditoria.data ?? []).map((entrada) => (
            <li key={entrada.id} className="text-sm">
              <Entrada entrada={entrada} fecha={fecha} />
            </li>
          ))}
        </ul>
      </section>
    </>
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

function Entrada({
  entrada,
  fecha,
}: {
  entrada: AuditEntryResponse;
  fecha: (iso: string) => string;
}): React.JSX.Element {
  return (
    <>
      {/* La acción se muestra con su nombre técnico —`user.suspended`— y no traducida: la lista de
          acciones crece con cada módulo, y una traducción incompleta miente peor que un
          identificador. Ponerle nombre a cada una es su propia tarea, cuando estén todas. */}
      <span className="font-mono">{entrada.action}</span>
      <span className="text-muted">
        {" · "}
        {fecha(entrada.occurredAt)}
        {entrada.actorUserId === null && ` · ${copy.fichaUsuario.porElSistema}`}
      </span>
    </>
  );
}
