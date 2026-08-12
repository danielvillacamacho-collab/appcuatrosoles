import { createFileRoute, Link } from "@tanstack/react-router";
import type { PracticeResponse } from "@polo/contracts";
import { Alert, Button } from "@polo/ui";
import { Pantalla } from "../../../components/Pantalla.js";
import { usePracticas } from "../../../features/practices/api/usePracticas.js";
import { useSesion } from "../../../features/session/api/useSesion.js";
import { useFecha } from "../../../lib/fechas.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * El tablero de prácticas (T-550, HU-050-02).
 *
 * **Sólo muestra lo que esta persona puede ver**: el recorte lo hace el servidor (R-050-05), así
 * que un estudiante no habilitado no recibe la práctica y aquí no hay nada que esconder.
 *
 * Cada tarjeta responde la pregunta por la que alguien abre esto: **si está dentro o no**. Un
 * tablero que sólo dice «postulado» deja a la gente sin saber si preparar los caballos.
 */
export const Route = createFileRoute("/_authenticated/practices/")({ component: Practicas });

function Practicas(): React.JSX.Element {
  const practicas = usePracticas();
  const sesion = useSesion();

  const puedeCrear = (sesion.data?.roles ?? []).some((rol) =>
    ["club_admin", "commissioner", "superadmin"].includes(rol.role),
  );

  return (
    <Pantalla
      titulo={copy.practicas.titulo}
      descripcion={copy.practicas.descripcion}
      ancho="tabla"
      acciones={
        puedeCrear ? (
          <Link to="/practices/new">
            <Button variante="secundaria">{copy.practicas.nueva}</Button>
          </Link>
        ) : undefined
      }
    >
      {practicas.isError && <Alert>{mensajeDeError(practicas.error)}</Alert>}
      {practicas.isPending && <p role="status">{copy.comun.cargando}</p>}

      {practicas.isSuccess && practicas.data.length === 0 && (
        <p className="text-muted">{copy.practicas.ninguna}</p>
      )}

      <ul className="grid gap-3 md:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {(practicas.data ?? []).map((practica) => (
          <li key={practica.id}>
            <Tarjeta practica={practica} />
          </li>
        ))}
      </ul>
    </Pantalla>
  );
}

function Tarjeta({ practica }: { practica: PracticeResponse }): React.JSX.Element {
  const fecha = useFecha();

  return (
    <Link
      to="/practices/$practiceId"
      params={{ practiceId: practica.id }}
      className="flex h-full flex-col gap-2 rounded-lg border border-sage bg-white/60 p-4"
    >
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-bold">{fecha(practica.startsAt)}</span>
        <span className="text-sm text-muted">{practica.fieldName}</span>
      </p>

      <p className="text-sm text-muted">
        {copy.practicas.chukkers(practica.chukkers)} ·{" "}
        {copy.practicas.cupos(practica.puestosDentro, practica.targetPlayers)}
        {practica.puestosEnEspera > 0 && ` · ${copy.practicas.enEspera(practica.puestosEnEspera)}`}
      </p>

      <MiEstado practica={practica} />
    </Link>
  );
}

/** «¿Preparo los caballos?» — la única pregunta que este tablero tiene que responder. */
export function MiEstado({ practica }: { practica: PracticeResponse }): React.JSX.Element {
  if (practica.status === "cancelled") {
    return (
      <span className="w-fit rounded-full bg-coquelicot/20 px-2 py-0.5 text-sm font-semibold">
        {copy.practicas.estados.cancelled}
      </span>
    );
  }

  if (practica.miPostulacion === null) {
    return <span className="text-sm text-muted">{copy.practicas.noEstoy}</span>;
  }

  const dentro = practica.miPostulacion.estado === "dentro";

  return (
    <span
      className={`w-fit rounded-full px-2 py-0.5 text-sm font-semibold ${
        dentro ? "bg-brunswick text-bone" : "bg-jonquil text-ink"
      }`}
    >
      {dentro
        ? copy.practicas.estoyDentro
        : copy.practicas.estoyEnEspera(practica.miPostulacion.posicion)}
    </span>
  );
}
