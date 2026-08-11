import { createFileRoute } from "@tanstack/react-router";
import type { DependentResponse } from "@polo/contracts";
import { Alert } from "@polo/ui";
import { Pantalla } from "../../../features/me/components/Pantalla.js";
import { useDependientes } from "../../../features/me/api/useDependientes.js";
import { fechaDeCalendario } from "../../../lib/fechas.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * Perfiles a cargo (T-133, HU-010-10, `spec.md` §10).
 *
 * Cada ficha contesta las dos preguntas que traen a alguien a esta pantalla: **¿a mí me van a
 * cobrar lo de este niño?** (R-010-10) y **¿puede entrar a la cancha?** — que es lo que decide la
 * exención firmada (R-010-12).
 */
export const Route = createFileRoute("/_authenticated/me/dependents")({ component: MisDependientes });

function MisDependientes(): React.JSX.Element {
  const dependientes = useDependientes();

  return (
    <Pantalla titulo={copy.dependientes.titulo} descripcion={copy.dependientes.descripcion}>
      {dependientes.isError && <Alert>{mensajeDeError(dependientes.error)}</Alert>}
      {dependientes.isPending && <p role="status">{copy.comun.cargando}</p>}

      {dependientes.isSuccess && dependientes.data.length === 0 && (
        <p className="text-muted">{copy.dependientes.sinNinguno}</p>
      )}

      <ul className="flex flex-col gap-3">
        {(dependientes.data ?? []).map((menor) => (
          <li key={menor.personId}>
            <Ficha menor={menor} />
          </li>
        ))}
      </ul>
    </Pantalla>
  );
}

function Ficha({ menor }: { menor: DependentResponse }): React.JSX.Element {
  return (
    <article className="rounded-lg border border-sage bg-white/60 p-4">
      <h2 className="text-base font-bold">{menor.fullName}</h2>

      {menor.birthdate !== null && (
        <p className="text-sm text-muted">
          {copy.dependientes.nacimiento}: {fechaDeCalendario(menor.birthdate)}
        </p>
      )}

      {menor.membershipCategory !== null && (
        <p className="text-sm text-muted">{menor.membershipCategory.name}</p>
      )}

      <p className="mt-2 text-sm">
        {menor.isPrimaryPayer ? copy.dependientes.pagas : copy.dependientes.noPagas}
      </p>

      <p
        className={`mt-1 text-sm font-medium ${
          menor.waiverAccepted ? "text-brunswick" : "text-coquelicot"
        }`}
      >
        {menor.waiverAccepted ? copy.dependientes.waiverFirmado : copy.dependientes.waiverPendiente}
      </p>
    </article>
  );
}
