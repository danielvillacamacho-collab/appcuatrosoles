import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import type { CalendarEntry, CalendarResponse } from "@polo/contracts";
import { esRangoValido, instanteDelDia } from "@polo/domain";
import { Alert, Button, TextField } from "@polo/ui";
import { Pantalla } from "../../components/Pantalla.js";
import { useCalendario } from "../../features/calendar/api/useCalendario.js";
import { useSesion } from "../../features/session/api/useSesion.js";
import {
  useBloquearFranja,
  useLevantarBloqueo,
} from "../../features/fields/api/useCanchas.js";
import { hoy } from "../../lib/hoy.js";
import { fechaDeCalendario } from "../../lib/fechas.js";
import { mensajeDeError } from "../../lib/error-message.js";
import { copy } from "../../i18n/es-CO.js";
import { salioBien } from "../../lib/mutacion.js";

/**
 * El calendario del día (T-460, HU-040-04).
 *
 * **Nace con sus dos formas, no adaptado después**: en un monitor, las canchas son columnas lado a
 * lado y el día se compara de un vistazo; en un celular, cada cancha ocupa casi todo el ancho y se
 * desliza a la siguiente — tres columnas apretadas en 375 px serían ilegibles las tres.
 *
 * **El día viaja en la URL**: «mira cómo quedó el martes» tiene que ser un enlace que se pueda
 * mandar, y recargar no puede devolver a hoy.
 *
 * Lo ajeno y privado llega del servidor ya reducido a «Ocupado» (R-040-07): esta pantalla no
 * esconde nada porque no recibe nada que esconder.
 */
export const Route = createFileRoute("/_authenticated/calendar")({
  validateSearch: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  }),
  component: Calendario,
});

function Calendario(): React.JSX.Element {
  const { date } = Route.useSearch();
  const dia = date ?? hoy();
  const navegar = useNavigate({ from: Route.fullPath });
  const calendario = useCalendario(dia);
  const sesion = useSesion();
  const [bloqueando, setBloqueando] = useState(false);

  const puedeBloquear = (sesion.data?.roles ?? []).some((rol) =>
    ["club_admin", "commissioner", "superadmin"].includes(rol.role),
  );

  const irA = (destino: string): void => {
    void navegar({ search: { date: destino } });
  };

  return (
    <Pantalla
      titulo={copy.calendario.titulo}
      descripcion={copy.calendario.descripcion}
      ancho="tabla"
      acciones={
        puedeBloquear ? (
          <Button variante="secundaria" onClick={() => setBloqueando((abierto) => !abierto)}>
            {copy.calendario.bloquear}
          </Button>
        ) : undefined
      }
    >
      <nav className="flex flex-wrap items-center gap-3" aria-label={copy.calendario.titulo}>
        <Button variante="secundaria" onClick={() => irA(diaVecino(dia, -1))}>
          {copy.calendario.diaAnterior}
        </Button>
        <p className="min-w-32 text-center text-base font-bold">{fechaDeCalendario(dia)}</p>
        <Button variante="secundaria" onClick={() => irA(diaVecino(dia, 1))}>
          {copy.calendario.diaSiguiente}
        </Button>
        <Button variante="texto" onClick={() => irA(hoy())}>
          {copy.calendario.hoy}
        </Button>
      </nav>

      {bloqueando && calendario.data !== undefined && (
        <FormularioDeBloqueo
          dia={dia}
          calendario={calendario.data}
          onListo={() => setBloqueando(false)}
        />
      )}

      {calendario.isError && <Alert>{mensajeDeError(calendario.error)}</Alert>}
      {calendario.isPending && <p role="status">{copy.comun.cargando}</p>}

      {calendario.isSuccess && (
        // **Las dos formas en una estructura**: en móvil es un carrusel horizontal con ajuste por
        // cancha (`snap`); desde `md` la misma lista se vuelve rejilla de columnas. El contenido es
        // idéntico — cambia cómo se recorre.
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:snap-none md:overflow-visible md:px-0 md:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {calendario.data.fields.map((cancha) => (
            <li
              key={cancha.id}
              className="w-[85%] flex-none snap-center md:w-auto"
              aria-label={cancha.name}
            >
              <ColumnaDeCancha
                nombre={cancha.name}
                entradas={cancha.entries}
                timezone={calendario.data.timezone}
                puedeBloquear={puedeBloquear}
              />
            </li>
          ))}
        </ul>
      )}
    </Pantalla>
  );
}

function ColumnaDeCancha({
  nombre,
  entradas,
  timezone,
  puedeBloquear,
}: {
  nombre: string;
  entradas: CalendarEntry[];
  timezone: string;
  puedeBloquear: boolean;
}): React.JSX.Element {
  return (
    <section className="flex h-full flex-col gap-2 rounded-lg border border-sage bg-white/60 p-3">
      <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-brunswick">{nombre}</h2>

      {entradas.length === 0 && <p className="text-sm text-muted">{copy.calendario.libreTodoElDia}</p>}

      <ul className="flex flex-col gap-2">
        {entradas.map((entrada, indice) => {
          const anterior = entradas[indice - 1];

          return (
            <li key={entrada.detalle ? entrada.id : `${entrada.startsAt}-ocupado`} className="flex flex-col gap-2">
              {/* El hueco entre la actividad anterior y ésta: es la mitad de la pregunta que trae a
                  alguien aquí — «¿qué está libre?» (HU-040-04). */}
              {anterior !== undefined && anterior.endsAt < entrada.startsAt && (
                <p className="text-sm text-muted">
                  {copy.calendario.libreEntre(hora(anterior.endsAt, timezone), hora(entrada.startsAt, timezone))}
                </p>
              )}
              <Franja entrada={entrada} timezone={timezone} puedeBloquear={puedeBloquear} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Franja({
  entrada,
  timezone,
  puedeBloquear,
}: {
  entrada: CalendarEntry;
  timezone: string;
  puedeBloquear: boolean;
}): React.JSX.Element {
  const levantar = useLevantarBloqueo();
  const rango = `${hora(entrada.startsAt, timezone)}–${hora(entrada.endsAt, timezone)}`;

  if (!entrada.detalle) {
    // **Sólo el horario.** Nada más llega del servidor, y nada más se pinta: aunque un día llegara
    // algo por error, este componente no sabe mostrarlo.
    return (
      <p className="rounded-md bg-sage/30 px-3 py-2 text-sm">
        <span className="font-medium">{rango}</span> · {copy.calendario.ocupado}
      </p>
    );
  }

  const esBloqueo = entrada.type === "maintenance" || entrada.type === "block";

  return (
    <div
      className={`rounded-md px-3 py-2 text-sm ${
        esBloqueo ? "border border-coquelicot/40 bg-coquelicot/10" : "bg-brunswick/10"
      }`}
    >
      <p>
        <span className="font-medium">{rango}</span> ·{" "}
        {copy.calendario.tipos[entrada.type] ?? entrada.type}
      </p>
      {entrada.reason !== null && <p className="text-muted">{entrada.reason}</p>}
      {esBloqueo && puedeBloquear && (
        <Button
          variante="texto"
          onClick={() => levantar.mutate(entrada.id)}
          cargando={levantar.isPending}
        >
          {copy.calendario.levantarBloqueo}
        </Button>
      )}
    </div>
  );
}

/**
 * El formulario de bloqueo (T-462), sobre el mismo día que se está mirando.
 *
 * Las horas se escriben como las diría el club y se convierten con `instanteDelDia` — la función
 * del dominio que sabe de zonas horarias. Armar `${dia}T${hora}:00-05:00` a mano fijaría el
 * desfase de Bogotá en el código.
 */
function FormularioDeBloqueo({
  dia,
  calendario,
  onListo,
}: {
  dia: string;
  calendario: CalendarResponse;
  onListo: () => void;
}): React.JSX.Element {
  const bloquear = useBloquearFranja();
  const [fieldId, setFieldId] = useState(calendario.fields[0]?.id ?? "");
  const [desde, setDesde] = useState("06:00");
  const [hasta, setHasta] = useState("07:00");
  const [motivo, setMotivo] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const enviar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault();

    if (motivo.trim() === "") {
      setErrorLocal(copy.bloquearFranja.motivoRequerido);

      return;
    }

    const startsAt = instanteDelDia(dia, desde, calendario.timezone);
    const endsAt = instanteDelDia(dia, hasta, calendario.timezone);

    // La misma regla del dominio que aplica el API: un rango vacío o al revés no viaja.
    if (!esRangoValido({ inicio: startsAt, fin: endsAt })) {
      setErrorLocal(copy.bloquearFranja.horaInvalida);

      return;
    }

    setErrorLocal(null);
    const guardado = await salioBien(
      bloquear.mutateAsync({
        fieldId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason: motivo.trim(),
      }),
    );

    if (!guardado) {
      return;
    }

    onListo();
  };

  return (
    <form
      onSubmit={(evento) => void enviar(evento)}
      className="flex flex-col gap-4 rounded-lg border border-sage bg-white/60 p-4"
      aria-label={copy.bloquearFranja.titulo}
    >
      <div>
        <h2 className="text-base font-bold">{copy.bloquearFranja.titulo}</h2>
        <p className="text-sm text-muted">{copy.bloquearFranja.descripcion}</p>
      </div>

      {errorLocal !== null && <Alert>{errorLocal}</Alert>}
      {bloquear.isError && <Alert>{mensajeDeError(bloquear.error)}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{copy.bloquearFranja.cancha}</span>
          <select
            value={fieldId}
            onChange={(evento) => setFieldId(evento.target.value)}
            className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
          >
            {calendario.fields.map((cancha) => (
              <option key={cancha.id} value={cancha.id}>
                {cancha.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{copy.bloquearFranja.desde}</span>
          <input
            type="time"
            value={desde}
            onChange={(evento) => setDesde(evento.target.value)}
            className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{copy.bloquearFranja.hasta}</span>
          <input
            type="time"
            value={hasta}
            onChange={(evento) => setHasta(evento.target.value)}
            className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
          />
        </label>

        <TextField
          label={copy.bloquearFranja.motivo}
          ayuda={copy.bloquearFranja.motivoAyuda}
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" cargando={bloquear.isPending}>
          {bloquear.isPending ? copy.bloquearFranja.bloqueando : copy.bloquearFranja.bloquear}
        </Button>
        <Button variante="texto" onClick={onListo}>
          {copy.comun.cancelar}
        </Button>
      </div>
    </form>
  );
}

/** La hora de un instante, en la zona del club — nunca la del navegador (R-040-05). */
function hora(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** El día vecino, con aritmética de calendario — sin tocar horas ni zonas. */
function diaVecino(dia: string, cuantos: number): string {
  const [ano, mes, fecha] = dia.split("-").map(Number);
  const vecino = new Date(Date.UTC(ano ?? 0, (mes ?? 1) - 1, (fecha ?? 1) + cuantos));

  return vecino.toISOString().slice(0, 10);
}
