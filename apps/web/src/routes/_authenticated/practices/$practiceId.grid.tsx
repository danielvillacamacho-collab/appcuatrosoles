import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { AdjustGridRequest, PracticeGridResponse } from "@polo/contracts";
import { Alert, Button, TextField } from "@polo/ui";
import { Pantalla } from "../../../components/Pantalla.js";
import {
  useAjustarGrilla,
  useCerrarPractica,
  useGrilla,
  useMarcarAusente,
  usePersonasDelClub,
} from "../../../features/practices/api/useGrilla.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * La grilla del comisario (T-731).
 *
 * **Se recorre por jugador, no por celda** (plan §7). Una matriz de 8 puestos × 8 chukkers en un
 * celular son 64 objetivos táctiles de menos de 40 píxeles, al sol y con guantes: no se usa, y el
 * comisario vuelve al papel. Una fila por persona con sus chukkers como fichas de 44 px es una
 * lista vertical corriente, y la corrección más común —«Ana no jugó el cuarto»— es **un solo toque
 * en la fila de Ana**.
 *
 * A diferencia de la pantalla de equipos, acá **no hay estado local**: cada toque viaja. En equipos
 * el comisario prueba alternativas antes de decidir, así que la latencia mataba la función; acá
 * cada toque es un hecho que ya ocurrió, no una hipótesis, y guardarlos en lote sólo abriría la
 * puerta a perderlos al cerrar la pestaña.
 */
export const Route = createFileRoute("/_authenticated/practices/$practiceId/grid")({
  component: Grilla,
});

/** Quién juega qué, reagrupado por persona: es como se mira y como se corrige. */
interface FilaDeJugador {
  personId: string;
  fullName: string;
  chukkers: number;
  noSePresento: boolean;
  /** En qué chukkers está, para pintar las fichas. */
  jugados: Set<number>;
  /** Dónde está en cada chukker, que es lo que hay que mandar al corregir. */
  lugares: Map<number, { equipo: "A" | "B"; position: number }>;
}

function filasDe(grilla: PracticeGridResponse): FilaDeJugador[] {
  const porPersona = new Map<string, FilaDeJugador>();

  for (const resumen of grilla.chukkersPorPersona) {
    porPersona.set(resumen.personId, {
      ...resumen,
      jugados: new Set<number>(),
      lugares: new Map(),
    });
  }

  for (const celda of grilla.celdas) {
    if (celda.persona === null) {
      continue;
    }

    const fila = porPersona.get(celda.persona.personId);

    if (fila !== undefined) {
      fila.jugados.add(celda.chukker);
      fila.lugares.set(celda.chukker, { equipo: celda.equipo, position: celda.position });
    }
  }

  return [...porPersona.values()];
}

/**
 * Un hueco libre en un chukker, para volver a meter a alguien que se había quitado.
 *
 * Se busca **el hueco de su propio puesto si existe**, y si no, cualquiera: quien vuelve a entrar
 * normalmente vuelve a donde estaba, y cuando no, cualquier lugar libre describe lo mismo —jugó ese
 * chukker—.
 */
function huecoEn(
  grilla: PracticeGridResponse,
  chukker: number,
): { equipo: "A" | "B"; position: number } | null {
  const libre = grilla.celdas.find(
    (celda) => celda.chukker === chukker && celda.persona === null,
  );

  return libre === undefined ? null : { equipo: libre.equipo, position: libre.position };
}

function Grilla(): React.JSX.Element {
  const { practiceId } = Route.useParams();
  const grilla = useGrilla(practiceId);

  return (
    <Pantalla
      titulo={copy.grilla.titulo}
      descripcion={copy.grilla.descripcion}
      volverA="/practices"
      ancho="tabla"
    >
      {grilla.isPending && <p>{copy.comun.cargando}</p>}
      {grilla.isError && <Alert>{copy.grilla.sinGrilla}</Alert>}
      {grilla.data !== undefined && <Tablero practiceId={practiceId} grilla={grilla.data} />}
    </Pantalla>
  );
}

function Tablero({
  practiceId,
  grilla,
}: {
  practiceId: string;
  grilla: PracticeGridResponse;
}): React.JSX.Element {
  const ajustar = useAjustarGrilla(practiceId);
  const ausente = useMarcarAusente(practiceId);
  const [sustituyendo, setSustituyendo] = useState<FilaDeJugador | null>(null);

  const filas = filasDe(grilla);
  const chukkers = Array.from({ length: grilla.chukkers }, (_, i) => i + 1);
  const congelada = grilla.cerrada;

  /** Un toque en una ficha: quitar a alguien de un chukker, o volver a ponerlo. */
  function alternar(fila: FilaDeJugador, chukker: number): void {
    const jugado = fila.jugados.has(chukker);
    const lugar = jugado ? fila.lugares.get(chukker) : huecoEn(grilla, chukker);

    if (lugar === undefined || lugar === null) {
      return;
    }

    const cambios: AdjustGridRequest = {
      cambios: [{ chukker, ...lugar, personId: jugado ? null : fila.personId }],
    };

    ajustar.mutate(cambios);
  }

  const error = ajustar.error ?? ausente.error;

  return (
    <>
      {congelada && <Alert>{copy.grilla.cerrada}</Alert>}
      {error !== null && <Alert>{mensajeDeError(error)}</Alert>}

      <ul className="flex flex-col gap-2">
        {filas.map((fila) => (
          <li
            key={fila.personId}
            className="flex flex-col gap-2 rounded-lg border border-sage bg-white/60 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{fila.fullName}</span>
              <span className="text-sm text-muted">
                {fila.noSePresento ? copy.grilla.noSePresento : copy.grilla.cuenta(fila.chukkers)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {chukkers.map((chukker) => {
                const jugado = fila.jugados.has(chukker);

                return (
                  <button
                    key={chukker}
                    type="button"
                    disabled={congelada || fila.noSePresento}
                    onClick={() => alternar(fila, chukker)}
                    aria-pressed={jugado}
                    aria-label={
                      jugado
                        ? copy.grilla.jugoChukker(fila.fullName, chukker)
                        : copy.grilla.noJugoChukker(fila.fullName, chukker)
                    }
                    className={`h-11 w-11 rounded-md border text-sm font-medium transition disabled:opacity-40 ${
                      jugado
                        ? "border-brunswick bg-brunswick text-white"
                        : "border-sage bg-white text-muted"
                    }`}
                  >
                    {chukker}
                  </button>
                );
              })}
            </div>

            {!congelada && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variante="texto"
                  onClick={() => setSustituyendo(fila)}
                  aria-label={copy.grilla.sustituir(fila.fullName)}
                >
                  {copy.grilla.sustituir(fila.fullName)}
                </Button>
                <Button
                  variante="texto"
                  onClick={() =>
                    ausente.mutate({
                      personId: fila.personId,
                      ausente: !fila.noSePresento,
                    })
                  }
                  aria-label={
                    fila.noSePresento
                      ? copy.grilla.quitarAusente(fila.fullName)
                      : copy.grilla.marcarAusente(fila.fullName)
                  }
                >
                  {fila.noSePresento
                    ? copy.grilla.quitarAusente(fila.fullName)
                    : copy.grilla.marcarAusenteCorto}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {sustituyendo !== null && (
        <Sustitucion
          practiceId={practiceId}
          sale={sustituyendo}
          alCerrar={() => setSustituyendo(null)}
        />
      )}

      <Cierre practiceId={practiceId} cerrada={congelada} />
    </>
  );
}

/**
 * «Entró Pedro por Luis» (T-732).
 *
 * Es la acción **menos frecuente y la más cara**, así que no compite por el espacio: vive detrás de
 * la fila del jugador. Al elegir a quien entra se le traspasan los chukkers que el otro tenía
 * marcados, que es lo que de verdad pasó — Pedro jugó los que Luis no jugó.
 */
function Sustitucion({
  practiceId,
  sale,
  alCerrar,
}: {
  practiceId: string;
  sale: FilaDeJugador;
  alCerrar: () => void;
}): React.JSX.Element {
  const [busqueda, setBusqueda] = useState("");
  const personas = usePersonasDelClub(busqueda);
  const ajustar = useAjustarGrilla(practiceId);

  async function entrar(personId: string): Promise<void> {
    // Los chukkers de quien sale pasan a quien entra, en **un solo lote**: es un intercambio, y por
    // separado el primero chocaría contra la restricción de la base.
    const cambios = [...sale.lugares.entries()].map(([chukker, lugar]) => ({
      chukker,
      ...lugar,
      personId,
    }));

    if (cambios.length > 0) {
      await ajustar.mutateAsync({ cambios });
    }

    alCerrar();
  }

  return (
    <section
      aria-label={copy.grilla.sustituirTitulo}
      className="flex flex-col gap-3 rounded-lg border border-brunswick bg-white p-4"
    >
      <h2 className="font-bold">{copy.grilla.sustituirTitulo}</h2>
      <p className="text-sm text-muted">{copy.grilla.sustituirAyuda}</p>

      <TextField
        label={copy.grilla.buscarPersona}
        value={busqueda}
        onChange={(evento) => setBusqueda(evento.target.value)}
      />

      {ajustar.isError && <Alert>{mensajeDeError(ajustar.error)}</Alert>}

      <ul className="flex flex-col gap-1">
        {(personas.data ?? [])
          .filter((persona) => persona.personId !== sale.personId)
          .slice(0, 8)
          .map((persona) => (
            <li key={persona.personId}>
              <Button variante="texto" onClick={() => void entrar(persona.personId)}>
                {persona.fullName}
              </Button>
            </li>
          ))}
      </ul>

      <div>
        <Button variante="secundaria" onClick={alCerrar}>
          {copy.grilla.cancelar}
        </Button>
      </div>
    </section>
  );
}

/**
 * Cerrar y reabrir (T-733).
 *
 * El botón de cerrar **no se esconde cuando la práctica todavía no empezó**: se deja y el API
 * rechaza con su motivo. Esconderlo obligaría a la pantalla a saber la hora del club, que es
 * exactamente la clase de regla que `docs/04` §6 manda no duplicar en la interfaz.
 */
function Cierre({ practiceId, cerrada }: { practiceId: string; cerrada: boolean }): React.JSX.Element {
  const cierre = useCerrarPractica(practiceId);

  return (
    <div className="flex flex-col gap-3 border-t border-sage pt-4">
      {/* El rechazo del cierre se muestra **acá**, donde vive la mutación. Cuando el mensaje colgaba
          del componente de arriba, la alerta leía otra instancia del hook y el motivo del servidor
          —«se puede cerrar cuando la práctica haya empezado»— no aparecía nunca. */}
      {cierre.isError && <Alert>{mensajeDeError(cierre.error)}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
      {cerrada ? (
        <Button
          variante="secundaria"
          onClick={() => cierre.mutate({ cerrar: false })}
          cargando={cierre.isPending}
        >
          {cierre.isPending ? copy.grilla.reabriendo : copy.grilla.reabrir}
        </Button>
      ) : (
        <>
          <Button onClick={() => cierre.mutate({ cerrar: true })} cargando={cierre.isPending}>
            {cierre.isPending ? copy.grilla.cerrando : copy.grilla.cerrar}
          </Button>
          <span className="text-sm text-muted">{copy.grilla.cerrarConfirmar}</span>
        </>
      )}
      </div>
    </div>
  );
}
