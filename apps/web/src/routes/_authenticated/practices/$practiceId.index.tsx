import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import type { PracticeResponse } from "@polo/contracts";
import { Alert, Button, TextField } from "@polo/ui";
import { Pantalla } from "../../../components/Pantalla.js";
import {
  useAceptarPareja,
  useCancelarPractica,
  usePostularme,
  usePractica,
  usePublicarPractica,
  useRetirarme,
} from "../../../features/practices/api/usePracticas.js";
import { useSesion } from "../../../features/session/api/useSesion.js";
import { useEquipos } from "../../../features/practices/api/useEquipos.js";
import { useGrilla } from "../../../features/practices/api/useGrilla.js";
import { handicapEnGoles } from "../../../lib/handicap.js";
import { MiEstado } from "./index.js";
import { useFecha } from "../../../lib/fechas.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";

/**
 * El detalle de una práctica (T-551).
 *
 * Dice **explícitamente si estás dentro o en la lista de espera, y en qué posición**. Es lo que
 * separa esta pantalla de un tablero de WhatsApp: allá uno cuenta mensajes hacia atrás y se
 * equivoca.
 */
export const Route = createFileRoute("/_authenticated/practices/$practiceId/")({
  component: Detalle,
});

function Detalle(): React.JSX.Element {
  const { practiceId } = Route.useParams();
  const practica = usePractica(practiceId);

  return (
    <Pantalla
      titulo={copy.practicas.titulo}
      volverA="/practices"
      ancho="tabla"
    >
      {practica.isError && <Alert>{mensajeDeError(practica.error)}</Alert>}
      {practica.isPending && <p role="status">{copy.comun.cargando}</p>}
      {practica.isSuccess && <Contenido practica={practica.data} />}
    </Pantalla>
  );
}

function Contenido({ practica }: { practica: PracticeResponse }): React.JSX.Element {
  const fecha = useFecha();
  const sesion = useSesion();
  const puedeAdministrar = (sesion.data?.roles ?? []).some((rol) =>
    ["club_admin", "commissioner", "superadmin"].includes(rol.role),
  );

  return (
    <>
      <section className="flex flex-col gap-2 rounded-lg border border-sage bg-white/60 p-4">
        <p className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-base font-bold">{fecha(practica.startsAt)}</span>
          <span className="rounded-full bg-sage px-2 py-0.5 text-sm font-semibold">
            {copy.practicas.estados[practica.status] ?? practica.status}
          </span>
        </p>

        <dl className="grid gap-2 sm:grid-cols-2">
          <Dato termino={copy.nuevaPractica.cancha} valor={practica.fieldName} />
          <Dato termino={copy.nuevaPractica.chukkers} valor={String(practica.chukkers)} />
          <Dato
            termino={copy.nuevaPractica.handicap}
            valor={copy.practicas.handicapUsado[practica.handicapType] ?? practica.handicapType}
          />
          <Dato
            termino={copy.practicas.cierra}
            valor={fecha(practica.applicationsCloseAt)}
          />
          <Dato termino={copy.practicas.decide} valor={fecha(practica.decisionAt)} />
          <Dato
            termino={copy.nuevaPractica.objetivo}
            valor={copy.practicas.cupos(practica.puestosDentro, practica.targetPlayers)}
          />
        </dl>

        {practica.cancellationReason !== null && <Alert>{practica.cancellationReason}</Alert>}

        <MiEstado practica={practica} />
      </section>

      <MiPostulacion practica={practica} />

      <section aria-labelledby="postulados" className="flex flex-col gap-2">
        <h2 id="postulados" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
          {copy.practicas.postulados}
        </h2>

        {practica.postulados.length === 0 && (
          <p className="text-sm text-muted">{copy.practicas.sinPostulados}</p>
        )}

        <ol className="flex flex-col gap-2">
          {practica.postulados.map((quien) => (
            <li
              key={quien.personId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sage bg-white/60 px-4 py-2"
            >
              <span className="font-medium">
                {quien.fullName}
                {quien.companero !== null && ` + ${quien.companero.fullName}`}
              </span>
              <span className="text-sm text-muted">
                {quien.estado === "dentro"
                  ? copy.practicas.estoyDentro
                  : copy.practicas.estoyEnEspera(quien.posicion)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <Equipos practica={practica} puedeAdministrar={puedeAdministrar} />

      <MiGrilla practica={practica} puedeAdministrar={puedeAdministrar} />

      {puedeAdministrar && <Administracion practica={practica} />}
    </>
  );
}

/**
 * Los equipos, cuando ya están aprobados (T-631).
 *
 * **Un borrador no se muestra**: el API le responde 404 a quien no puede aprobarlo (R-051-05), así
 * que acá no hay nada que esconder — si la consulta falla, simplemente no hay sección.
 */
function Equipos({
  practica,
  puedeAdministrar,
}: {
  practica: PracticeResponse;
  puedeAdministrar: boolean;
}): React.JSX.Element | null {
  const sesion = useSesion();
  const equipos = useEquipos(practica.id);

  if (practica.status !== "confirmed") {
    return null;
  }

  if (!equipos.isSuccess) {
    // Ni «cargando» ni un error: para un jugador, unos equipos sin aprobar no existen.
    return puedeAdministrar ? (
      <div>
        <Link to="/practices/$practiceId/teams" params={{ practiceId: practica.id }}>
          <Button variante="secundaria">{copy.equipos.titulo}</Button>
        </Link>
      </div>
    ) : null;
  }

  const miPersona = sesion.data?.personId;

  return (
    <section aria-labelledby="equipos" className="flex flex-col gap-3">
      <h2 id="equipos" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
        {copy.equipos.titulo}
      </h2>

      <div className="grid gap-4 md:grid-cols-2">
        {equipos.data.equipos.map((equipo) => {
          const esElMio = equipo.slots.some(
            (puesto) =>
              puesto.titular.personId === miPersona || puesto.companero?.personId === miPersona,
          );

          return (
            <div
              key={equipo.label}
              className={`flex flex-col gap-2 rounded-lg border p-4 ${
                esElMio ? "border-brunswick bg-brunswick/10" : "border-sage bg-white/60"
              }`}
            >
              <p className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-[0.15em] text-brunswick">
                  {copy.equipos.equipo(equipo.label)}
                </span>
                <span className="font-bold">{handicapEnGoles(equipo.handicapTotalHalves)}</span>
              </p>

              {esElMio && <p className="text-sm font-medium">{copy.equipos.miEquipo}</p>}

              <ul className="flex flex-col gap-1">
                {equipo.slots.map((puesto) => (
                  <li key={puesto.id}>
                    {puesto.companero === null
                      ? puesto.titular.fullName
                      : copy.equipos.compartido(
                          puesto.titular.fullName,
                          puesto.companero.fullName,
                        )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {puedeAdministrar && (
        <div>
          <Link to="/practices/$practiceId/teams" params={{ practiceId: practica.id }}>
            <Button variante="secundaria">{copy.equipos.titulo}</Button>
          </Link>
        </div>
      )}
    </section>
  );
}

/** Postularse, retirarse, y el medio hombre. */
function MiPostulacion({ practica }: { practica: PracticeResponse }): React.JSX.Element | null {
  const postularme = usePostularme(practica.id);
  const retirarme = useRetirarme(practica.id);
  const aceptar = useAceptarPareja(practica.id);
  const [chukkers, setChukkers] = useState("4");
  const [companero, setCompanero] = useState("");

  if (!practica.abierta) {
    return null;
  }

  if (practica.miPostulacion !== null) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-sage bg-white/60 p-4">
        {retirarme.isError && <Alert>{mensajeDeError(retirarme.error)}</Alert>}
        {aceptar.isError && <Alert>{mensajeDeError(aceptar.error)}</Alert>}

        {practica.miPostulacion.medioHombre !== null && (
          <p className="text-sm">
            {practica.miPostulacion.medioHombre.aceptada
              ? copy.practicas.parejaFormada(practica.miPostulacion.medioHombre.fullName)
              : copy.practicas.parejaPendiente(practica.miPostulacion.medioHombre.fullName)}
          </p>
        )}

        {practica.miPostulacion.propuestaRecibida !== null && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              {copy.practicas.aceptarPareja(practica.miPostulacion.propuestaRecibida.fullName)}
            </p>
            <Button
              variante="secundaria"
              onClick={() =>
                void aceptar.mutateAsync(practica.miPostulacion?.propuestaRecibida?.personId ?? "")
              }
              cargando={aceptar.isPending}
            >
              {copy.practicas.aceptar}
            </Button>
          </div>
        )}

        <div>
          <Button
            variante="texto"
            onClick={() => void retirarme.mutateAsync()}
            cargando={retirarme.isPending}
          >
            {copy.practicas.retirarme}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        void postularme.mutateAsync({
          chukkersOffered: Number(chukkers),
          ...(companero.trim() === "" ? {} : { halfManPartnerPersonId: companero.trim() }),
        });
      }}
      className="flex flex-col gap-4 rounded-lg border border-sage bg-white/60 p-4"
      aria-label={copy.practicas.postularme}
    >
      {postularme.isError && <Alert>{mensajeDeError(postularme.error)}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={copy.practicas.chukkersQueCubro}
          ayuda={copy.practicas.chukkersAyuda}
          type="number"
          value={chukkers}
          onChange={(evento) => setChukkers(evento.target.value)}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{copy.practicas.compartirPuesto}</span>
          <select
            value={companero}
            onChange={(evento) => setCompanero(evento.target.value)}
            className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
          >
            <option value="">—</option>
            {practica.postulados.map((quien) => (
              <option key={quien.personId} value={quien.personId}>
                {quien.fullName}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted">{copy.practicas.compartirAyuda}</span>
        </label>
      </div>

      <div>
        <Button type="submit" cargando={postularme.isPending}>
          {postularme.isPending ? copy.practicas.postulando : copy.practicas.postularme}
        </Button>
      </div>
    </form>
  );
}

/** Publicar y cancelar: sólo para quien administra. */
function Administracion({ practica }: { practica: PracticeResponse }): React.JSX.Element {
  const publicar = usePublicarPractica();
  const cancelar = useCancelarPractica(practica.id);
  const [motivo, setMotivo] = useState("");

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-sage bg-white/60 p-4">
      {publicar.isError && <Alert>{mensajeDeError(publicar.error)}</Alert>}
      {cancelar.isError && <Alert>{mensajeDeError(cancelar.error)}</Alert>}

      {practica.status === "draft" && (
        <div>
          <Button onClick={() => void publicar.mutateAsync(practica.id)} cargando={publicar.isPending}>
            {publicar.isPending ? copy.nuevaPractica.publicando : copy.nuevaPractica.publicar}
          </Button>
        </div>
      )}

      {(practica.status === "published" || practica.status === "confirmed") && (
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label={copy.nuevaPractica.motivoCancelacion}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
          />
          <Button
            variante="secundaria"
            onClick={() => void cancelar.mutateAsync(motivo.trim())}
            cargando={cancelar.isPending}
            disabled={motivo.trim() === ""}
          >
            {copy.nuevaPractica.cancelar}
          </Button>
        </div>
      )}
    </section>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-sm text-muted">{termino}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}

/**
 * Qué se jugó, desde el lado del jugador (T-734).
 *
 * **La única pregunta que un jugador le hace a esta pantalla es «¿me contaron bien?»**, así que eso
 * es lo que responde: sus chukkers y su cuenta, sin botones de edición.
 *
 * La cuenta **viene calculada del servidor** (R-052-02). Recalcularla acá sería una segunda
 * implementación del número del que va a colgar el cobro, y dos implementaciones dan distinto el
 * día que haya un caso raro.
 */
function MiGrilla({
  practica,
  puedeAdministrar,
}: {
  practica: PracticeResponse;
  puedeAdministrar: boolean;
}): React.JSX.Element | null {
  const sesion = useSesion();
  const grilla = useGrilla(practica.id);

  if (practica.status !== "confirmed" && practica.status !== "played") {
    return null;
  }

  if (!grilla.isSuccess) {
    // Sin equipos aprobados no hay grilla, y no hay nada que decir todavía.
    return null;
  }

  const miPersona = sesion.data?.personId;
  const mia = grilla.data.chukkersPorPersona.find((fila) => fila.personId === miPersona);

  return (
    <section aria-labelledby="mi-grilla" className="flex flex-col gap-3">
      <h2 id="mi-grilla" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
        {copy.grilla.misChukkers}
      </h2>

      {mia === undefined ? (
        <p className="text-muted">{copy.grilla.noJugaste}</p>
      ) : (
        <p>
          {mia.noSePresento
            ? copy.grilla.noSePresento
            : copy.grilla.misChukkersCuenta(mia.chukkers)}
        </p>
      )}

      {puedeAdministrar && (
        <div>
          <Link to="/practices/$practiceId/grid" params={{ practiceId: practica.id }}>
            <Button variante="secundaria">{copy.grilla.titulo}</Button>
          </Link>
        </div>
      )}
    </section>
  );
}
