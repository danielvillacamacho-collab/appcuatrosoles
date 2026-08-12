import { useState } from "react";
import type { HandicapTypeName, HandicapValue } from "@polo/contracts";
import { Alert, Button, TextField } from "@polo/ui";
import {
  useFijarHandicap,
  useHandicaps,
  useHistorialDeHandicap,
} from "./api/useHandicaps.js";
import { useSesion } from "../session/api/useSesion.js";
import { golesAMediosGoles, handicapEnGoles } from "../../lib/handicap.js";
import { useFecha } from "../../lib/fechas.js";
import { mensajeDeError } from "../../lib/error-message.js";
import { copy } from "../../i18n/es-CO.js";

/**
 * Los handicaps de una persona (T-340, T-341, T-342).
 *
 * Se engancha a la ficha que ya existe en vez de tener pantalla propia: el handicap es un dato de
 * la persona, y hacerlo una pantalla aparte obligaría a navegar para responder «¿con cuánto juega?».
 *
 * **Fijar handicap sólo existe para el comisario.** Ofrecer un botón que el API va a rechazar es
 * mentir — el mismo criterio que el bloqueo de cancha en `specs/040`.
 */
export function HandicapDePersona({ personId }: { personId: string }): React.JSX.Element {
  const handicaps = useHandicaps(personId);
  const sesion = useSesion();
  const [editando, setEditando] = useState<HandicapTypeName | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  const esComisario = (sesion.data?.roles ?? []).some((rol) => rol.role === "commissioner");

  return (
    <section aria-labelledby="handicaps" className="flex flex-col gap-3">
      <h2 id="handicaps" className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
        {copy.handicaps.titulo}
      </h2>

      {handicaps.isError && <Alert>{mensajeDeError(handicaps.error)}</Alert>}
      {handicaps.isPending && <p role="status">{copy.comun.cargando}</p>}

      {handicaps.isSuccess && (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Valor
              etiqueta={copy.handicaps.internacional}
              valor={handicaps.data.international}
              onEditar={esComisario ? () => setEditando("international") : undefined}
            />
            <Valor
              etiqueta={copy.handicaps.delClub}
              valor={handicaps.data.club}
              onEditar={esComisario ? () => setEditando("club") : undefined}
            />
          </dl>

          {editando !== null && (
            <Formulario
              personId={personId}
              tipo={editando}
              actual={editando === "club" ? handicaps.data.club : handicaps.data.international}
              onListo={() => setEditando(null)}
            />
          )}

          <div>
            <Button variante="texto" onClick={() => setVerHistorial((abierto) => !abierto)}>
              {copy.handicaps.verHistorial}
            </Button>
          </div>

          {verHistorial && <Historial personId={personId} />}
        </>
      )}
    </section>
  );
}

function Valor({
  etiqueta,
  valor,
  onEditar,
}: {
  etiqueta: string;
  valor: HandicapValue;
  onEditar?: (() => void) | undefined;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-sage bg-white/60 p-3">
      <dt className="text-sm text-muted">{etiqueta}</dt>
      <dd className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-bold">{handicapEnGoles(valor.valueHalves)}</span>
        {onEditar !== undefined && (
          <Button variante="texto" onClick={onEditar}>
            {copy.handicaps.fijar}
          </Button>
        )}
      </dd>
      {!valor.calificado && (
        // **−2 y «sin calificar» valen lo mismo y no son lo mismo** (R-030-05). El número solo no
        // alcanza para distinguirlos, así que se dice con palabras.
        <p className="text-sm text-muted">
          <span className="font-medium">{copy.handicaps.sinCalificar}.</span>{" "}
          {copy.handicaps.sinCalificarAyuda}
        </p>
      )}
    </div>
  );
}

function Formulario({
  personId,
  tipo,
  actual,
  onListo,
}: {
  personId: string;
  tipo: HandicapTypeName;
  actual: HandicapValue;
  onListo: () => void;
}): React.JSX.Element {
  const fijar = useFijarHandicap(personId, tipo);
  const [goles, setGoles] = useState(handicapEnGoles(actual.valueHalves).replace("−", "-"));
  const [motivo, setMotivo] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const enviar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault();

    // El comisario escribe goles; el API espera medios goles. La conversión rechaza «2,3» en vez de
    // redondearlo, igual que el dominio.
    const valueHalves = golesAMediosGoles(goles);

    if (valueHalves === null) {
      setErrorLocal(copy.handicaps.valorInvalido);

      return;
    }

    if (motivo.trim() === "") {
      setErrorLocal(copy.handicaps.motivoRequerido);

      return;
    }

    setErrorLocal(null);
    await fijar.mutateAsync({ valueHalves, reason: motivo.trim() });
    onListo();
  };

  return (
    <form
      onSubmit={(evento) => void enviar(evento)}
      className="flex flex-col gap-4 rounded-lg border border-sage bg-white/60 p-4"
      aria-label={`${copy.handicaps.fijar} · ${copy.handicaps.tipos[tipo] ?? tipo}`}
    >
      {errorLocal !== null && <Alert>{errorLocal}</Alert>}
      {fijar.isError && <Alert>{mensajeDeError(fijar.error)}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={copy.handicaps.nuevoValor}
          ayuda={copy.handicaps.nuevoValorAyuda}
          value={goles}
          onChange={(evento) => setGoles(evento.target.value)}
        />
        <TextField
          label={copy.handicaps.motivo}
          ayuda={copy.handicaps.motivoAyuda}
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" cargando={fijar.isPending}>
          {fijar.isPending ? copy.handicaps.guardando : copy.handicaps.guardar}
        </Button>
        <Button variante="texto" onClick={onListo}>
          {copy.comun.cancelar}
        </Button>
      </div>
    </form>
  );
}

function Historial({ personId }: { personId: string }): React.JSX.Element {
  const historial = useHistorialDeHandicap(personId, true);
  const fecha = useFecha();

  // A quien no puede verlo el API le responde 404 (R-030-09): se dice que no está, no que no puede.
  if (historial.isError) {
    return <Alert>{mensajeDeError(historial.error)}</Alert>;
  }

  if (historial.isPending) {
    return <p role="status">{copy.comun.cargando}</p>;
  }

  if (historial.data.entries.length === 0) {
    // Un historial vacío es un dato, no una pantalla en blanco.
    return <p className="text-sm text-muted">{copy.handicaps.historialVacio}</p>;
  }

  return (
    <ol aria-label={copy.handicaps.historial} className="flex flex-col gap-2">
      {historial.data.entries.map((entrada) => (
        <li key={entrada.id} className="rounded-lg border border-sage bg-white/60 p-3 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {copy.handicaps.cambio(
                handicapEnGoles(entrada.previousHalves),
                handicapEnGoles(entrada.newHalves),
              )}
            </span>
            <span className="text-muted">{copy.handicaps.tipos[entrada.type] ?? entrada.type}</span>
          </p>
          <p>{entrada.reason}</p>
          <p className="text-muted">
            {fecha(entrada.changedAt)} · {copy.handicaps.porQuien(entrada.changedBy.fullName)}
            {entrada.season !== null && ` · ${entrada.season.name}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
