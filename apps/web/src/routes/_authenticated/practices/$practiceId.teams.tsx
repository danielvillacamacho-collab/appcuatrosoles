import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { PracticeSlotResponse, PracticeTeamsResponse } from "@polo/contracts";
import { Alert, Button } from "@polo/ui";
import { Pantalla } from "../../../components/Pantalla.js";
import {
  useAjustarEquipos,
  useAprobarEquipos,
  useEquipos,
  useProponerEquipos,
} from "../../../features/practices/api/useEquipos.js";
import { handicapEnGoles } from "../../../lib/handicap.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * La pantalla del comisario (T-630).
 *
 * **El asistente de balance no es una pantalla aparte: es el número al lado de cada equipo.** Que
 * la diferencia se actualice al mover a alguien es la función entera, y por eso el estado de los
 * equipos vive acá y no en el servidor: mover a un jugador no puede costar un viaje de red, o el
 * comisario deja de probar alternativas.
 *
 * Se guarda cuando él lo decide, mandando **la composición entera** — no una lista de movimientos.
 */
export const Route = createFileRoute("/_authenticated/practices/$practiceId/teams")({
  component: Equipos,
});

/**
 * Cuando no hay equipos todavía.
 *
 * **Ofrece armarlos**, y eso no es un adorno: una práctica confirmada antes de que este módulo
 * existiera —o una que se confirmó a mano— no tiene propuesta, y sin este botón el comisario queda
 * en un callejón con el API perfectamente capaz de armarlos. Es el mismo agujero que apareció en
 * `specs/030` con la pantalla de handicaps y en `specs/050` con aceptar un medio hombre: el camino
 * faltaba, no la funcionalidad. Lo destapó abrir la pantalla en un navegador, otra vez.
 */
function SinEquipos({ practiceId }: { practiceId: string }): React.JSX.Element {
  const proponer = useProponerEquipos(practiceId);

  return (
    <>
      <Alert>{copy.equipos.sinEquipos}</Alert>
      {proponer.isError && <Alert>{mensajeDeError(proponer.error)}</Alert>}
      <div>
        <Button onClick={() => void proponer.mutateAsync()} cargando={proponer.isPending}>
          {proponer.isPending ? copy.equipos.armando : copy.equipos.armar}
        </Button>
      </div>
    </>
  );
}

/** Los dos equipos, como los está manipulando el comisario. */
type EnPantalla = { label: "A" | "B"; slots: PracticeSlotResponse[] }[];

function Equipos(): React.JSX.Element {
  const { practiceId } = Route.useParams();
  const equipos = useEquipos(practiceId);

  return (
    <Pantalla
      titulo={copy.equipos.titulo}
      descripcion={copy.equipos.descripcion}
      volverA="/practices"
      ancho="tabla"
    >
      {equipos.isPending && <p role="status">{copy.comun.cargando}</p>}
      {equipos.isError && <SinEquipos practiceId={practiceId} />}
      {equipos.isSuccess && <Tablero practiceId={practiceId} desdeElServidor={equipos.data} />}
    </Pantalla>
  );
}

function Tablero({
  practiceId,
  desdeElServidor,
}: {
  practiceId: string;
  desdeElServidor: PracticeTeamsResponse;
}): React.JSX.Element {
  const ajustar = useAjustarEquipos(practiceId);
  const aprobar = useAprobarEquipos(practiceId);
  const proponer = useProponerEquipos(practiceId);

  const [enPantalla, setEnPantalla] = useState<EnPantalla>(() => aEnPantalla(desdeElServidor));

  // Cuando el servidor manda algo **distinto** —se rearmó, se aprobó— la pantalla se pone al día.
  //
  // No hace falta comparar por valor: TanStack Query aplica *structural sharing*, así que un
  // refresco cuyos datos son iguales devuelve **la misma referencia** y este efecto ni se entera.
  // Llegué a escribir esa comparación creyendo que un refresco de fondo le borraba los cambios al
  // comisario, y **tres intentos de reproducirlo fallaron**: pasaban igual con y sin ella. Lo que
  // fallaba era otra cosa (ver el E2E), y una guarda que no protege de nada es una guarda que
  // alguien va a tener que entender en vano.
  useEffect(() => {
    setEnPantalla(aEnPantalla(desdeElServidor));
  }, [desdeElServidor]);

  const sumas = enPantalla.map((equipo) =>
    equipo.slots.reduce((total, puesto) => total + puesto.effectiveHandicapHalves, 0),
  );
  const diferencia = Math.abs((sumas[0] ?? 0) - (sumas[1] ?? 0));
  const cambiado = JSON.stringify(aEnPantalla(desdeElServidor)) !== JSON.stringify(enPantalla);

  /** Mover un puesto al otro equipo. **Sin ir al servidor**: es lo que hace útil probar. */
  const mover = (slotId: string): void => {
    setEnPantalla((actual) => {
      const desde = actual.findIndex((equipo) =>
        equipo.slots.some((puesto) => puesto.id === slotId),
      );

      if (desde < 0) {
        return actual;
      }

      const hacia = desde === 0 ? 1 : 0;
      const puesto = actual[desde]?.slots.find((candidato) => candidato.id === slotId);

      if (puesto === undefined) {
        return actual;
      }

      return actual.map((equipo, i) => {
        if (i === desde) {
          return { ...equipo, slots: equipo.slots.filter((otro) => otro.id !== slotId) };
        }

        return i === hacia ? { ...equipo, slots: [...equipo.slots, puesto] } : equipo;
      });
    });
  };

  const guardar = async (): Promise<void> => {
    await ajustar.mutateAsync({
      equipos: enPantalla.map((equipo) => ({
        label: equipo.label,
        slotIds: equipo.slots.map((puesto) => puesto.id),
      })),
    });
  };

  return (
    <>
      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-sage bg-white/60 p-4">
        <p>
          <span className="text-sm text-muted">{copy.equipos.diferencia}: </span>
          <span className="text-base font-bold">
            {diferencia === 0 ? copy.equipos.parejos : handicapEnGoles(diferencia)}
          </span>
        </p>
        <p className="text-sm text-muted">
          {desdeElServidor.aprobados ? copy.equipos.aprobados : copy.equipos.sinAprobar}
        </p>
        {cambiado && <p className="text-sm font-medium">{copy.equipos.cambiosSinGuardar}</p>}
      </section>

      {ajustar.isError && <Alert>{mensajeDeError(ajustar.error)}</Alert>}
      {aprobar.isError && <Alert>{mensajeDeError(aprobar.error)}</Alert>}

      <div className="grid gap-4 md:grid-cols-2">
        {enPantalla.map((equipo, i) => (
          <section
            key={equipo.label}
            aria-label={copy.equipos.equipo(equipo.label)}
            className="flex flex-col gap-2 rounded-lg border border-sage bg-white/60 p-4"
          >
            <h2 className="flex items-center justify-between text-sm font-bold uppercase tracking-[0.15em] text-brunswick">
              {copy.equipos.equipo(equipo.label)}
              <span className="text-base font-bold normal-case tracking-normal text-ink">
                {handicapEnGoles(sumas[i] ?? 0)}
              </span>
            </h2>

            <ul className="flex flex-col gap-2">
              {equipo.slots.map((puesto) => (
                <li
                  key={puesto.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-sage/20 px-3 py-2"
                >
                  <span>
                    <span className="font-medium">
                      {puesto.companero === null
                        ? puesto.titular.fullName
                        : copy.equipos.compartido(
                            puesto.titular.fullName,
                            puesto.companero.fullName,
                          )}
                    </span>{" "}
                    <span className="text-sm text-muted">
                      {copy.equipos.pesaComo(handicapEnGoles(puesto.effectiveHandicapHalves))}
                    </span>
                  </span>
                  <Button
                    variante="texto"
                    onClick={() => mover(puesto.id)}
                    aria-label={copy.equipos.mover(puesto.titular.fullName)}
                  >
                    ⇄
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void guardar()} cargando={ajustar.isPending} disabled={!cambiado}>
          {ajustar.isPending ? copy.equipos.guardando : copy.equipos.guardar}
        </Button>
        <Button
          variante="secundaria"
          onClick={() => void aprobar.mutateAsync()}
          cargando={aprobar.isPending}
        >
          {desdeElServidor.aprobados ? copy.equipos.reaprobar : copy.equipos.aprobar}
        </Button>
        <Button
          variante="texto"
          onClick={() => void proponer.mutateAsync()}
          cargando={proponer.isPending}
        >
          {copy.equipos.rearmar}
        </Button>
      </div>
    </>
  );
}

function aEnPantalla(respuesta: PracticeTeamsResponse): EnPantalla {
  return respuesta.equipos.map((equipo) => ({ label: equipo.label, slots: [...equipo.slots] }));
}
