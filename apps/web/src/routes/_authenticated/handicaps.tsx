import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import type { HandicapTypeName } from "@polo/contracts";
import { Alert, Button } from "@polo/ui";
import { Pantalla } from "../../components/Pantalla.js";
import { HandicapDePersona } from "../../features/handicaps/HandicapDePersona.js";
import { useHandicapsDelClub } from "../../features/handicaps/api/useHandicaps.js";
import { handicapEnGoles } from "../../lib/handicap.js";
import { mensajeDeError } from "../../lib/error-message.js";
import { copy } from "../../i18n/es-CO.js";

/**
 * Los handicaps del club (T-343).
 *
 * **Existe porque sin ella el módulo no lo puede usar quien tiene que usarlo.** Los handicaps
 * vivían sólo dentro de la ficha de usuario, y `GET /users` exige `user.edit` — un permiso que el
 * comisario **no tiene** y no debe tener: su autoridad es deportiva, no administrativa. El único
 * rol que puede fijar un handicap no tenía cómo llegar a la pantalla donde se fija.
 *
 * Lo destapó el E2E al entrar como comisario de verdad en vez de con un administrador al que se le
 * había puesto el rol a mano.
 */
export const Route = createFileRoute("/_authenticated/handicaps")({
  validateSearch: z.object({
    type: z.enum(["international", "club"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
  }),
  component: HandicapsDelClub,
});

function HandicapsDelClub(): React.JSX.Element {
  const { type, page } = Route.useSearch();
  const tipo: HandicapTypeName = type ?? "club";
  const pagina = page ?? 1;
  const listado = useHandicapsDelClub(tipo, pagina);
  const navegar = useNavigate({ from: Route.fullPath });
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <Pantalla
      titulo={copy.handicapsDelClub.titulo}
      descripcion={copy.handicapsDelClub.descripcion}
      ancho="tabla"
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label={copy.handicapsDelClub.tipo}>
        {(["club", "international"] as const).map((cual) => (
          <Button
            key={cual}
            variante={cual === tipo ? "primaria" : "secundaria"}
            onClick={() => void navegar({ search: { type: cual } })}
          >
            {copy.handicaps.tipos[cual] ?? cual}
          </Button>
        ))}
      </div>

      {listado.isError && <Alert>{mensajeDeError(listado.error)}</Alert>}
      {listado.isPending && <p role="status">{copy.comun.cargando}</p>}

      {listado.isSuccess && (
        <>
          <ul className="flex flex-col gap-2">
            {listado.data.items.map((fila) => (
              <li key={fila.personId} className="rounded-lg border border-sage bg-white/60">
                <button
                  type="button"
                  onClick={() =>
                    setAbierta((actual) => (actual === fila.personId ? null : fila.personId))
                  }
                  aria-expanded={abierta === fila.personId}
                  className="flex min-h-tap w-full flex-wrap items-center justify-between gap-2 px-4 py-2 text-left"
                >
                  <span className="font-medium">{fila.fullName}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-base font-bold">
                      {handicapEnGoles(fila.handicap.valueHalves)}
                    </span>
                    {!fila.handicap.calificado && (
                      <span className="text-sm text-muted">{copy.handicaps.sinCalificar}</span>
                    )}
                  </span>
                </button>

                {abierta === fila.personId && (
                  <div className="border-t border-sage px-4 py-3">
                    <HandicapDePersona personId={fila.personId} />
                  </div>
                )}
              </li>
            ))}
          </ul>

          <Paginacion
            total={listado.data.total}
            page={listado.data.page}
            limit={listado.data.limit}
            onIr={(destino) => void navegar({ search: { type: tipo, page: destino } })}
          />
        </>
      )}
    </Pantalla>
  );
}

function Paginacion({
  total,
  page,
  limit,
  onIr,
}: {
  total: number;
  page: number;
  limit: number;
  onIr: (pagina: number) => void;
}): React.JSX.Element | null {
  const paginas = Math.ceil(total / limit);

  if (paginas <= 1) {
    return null;
  }

  return (
    <nav className="flex flex-wrap items-center gap-3" aria-label={copy.handicapsDelClub.paginacion}>
      <Button
        variante="secundaria"
        onClick={() => onIr(page - 1)}
        disabled={page <= 1}
      >
        {copy.handicapsDelClub.anterior}
      </Button>
      {/* El total va explícito: sin él sólo se puede decir «siguiente», y nadie sabe si el club
          tiene treinta socios o tres mil. */}
      <p>{copy.handicapsDelClub.deTotal(page, paginas, total)}</p>
      <Button
        variante="secundaria"
        onClick={() => onIr(page + 1)}
        disabled={page >= paginas}
      >
        {copy.handicapsDelClub.siguiente}
      </Button>
    </nav>
  );
}
