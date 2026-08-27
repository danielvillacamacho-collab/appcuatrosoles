import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, Button, TextField } from "@polo/ui";
import { Pantalla } from "../../../components/Pantalla.js";
import { useCrearPractica } from "../../../features/practices/api/usePracticas.js";
import { useCanchas } from "../../../features/fields/api/useCanchas.js";
import { useClub } from "../../../features/club/api/useClub.js";
import { instanteDelDia } from "@polo/domain";
import { hoy } from "../../../lib/hoy.js";
import { mensajeDeError } from "../../../lib/error-message.js";
import { copy } from "../../../i18n/es-CO.js";
import { oNulo } from "../../../lib/mutacion.js";

/**
 * Crear una práctica (T-552).
 *
 * **Se crea en borrador**: publicarla es un segundo paso, y es el que reserva la cancha. Separarlo
 * no es ceremonia — permite armar la semana con calma y descubrir un choque de cancha antes de que
 * nadie se haya postulado.
 *
 * Las horas se escriben como las diría el club y se convierten con `instanteDelDia`, la función de
 * dominio que sabe de zonas horarias. Armar el instante a mano fijaría el desfase de Bogotá en el
 * código, que es el error contra el que existe esa función.
 */
export const Route = createFileRoute("/_authenticated/practices/new")({ component: NuevaPractica });

function NuevaPractica(): React.JSX.Element {
  const crear = useCrearPractica();
  const canchas = useCanchas();
  const club = useClub();
  const navegar = useNavigate();

  const [fieldId, setFieldId] = useState("");
  const [dia, setDia] = useState(hoy());
  const [desde, setDesde] = useState("16:00");
  const [hasta, setHasta] = useState("18:00");
  const [chukkers, setChukkers] = useState("6");
  const [handicapType, setHandicapType] = useState<"club" | "international">("club");
  const [objetivo, setObjetivo] = useState("8");
  const [minimo, setMinimo] = useState("6");
  const [cierre, setCierre] = useState("12:00");
  const [decision, setDecision] = useState("13:00");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const zona = club.data?.timezone ?? "America/Bogota";
  const cancha = fieldId === "" ? canchas.data?.[0]?.id : fieldId;

  const enviar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault();

    if (cancha === undefined) {
      setErrorLocal(copy.nuevaPractica.camposIncompletos);

      return;
    }

    setErrorLocal(null);

    const creada = await oNulo(
      crear.mutateAsync({
        fieldId: cancha,
        startsAt: instanteDelDia(dia, desde, zona).toISOString(),
        endsAt: instanteDelDia(dia, hasta, zona).toISOString(),
        chukkers: Number(chukkers),
        handicapType,
        targetPlayers: Number(objetivo),
        minPlayers: Number(minimo),
        applicationsCloseAt: instanteDelDia(dia, cierre, zona).toISOString(),
          decisionAt: instanteDelDia(dia, decision, zona).toISOString(),
      }),
    );

    if (creada === null) {
      return;
    }

    await navegar({ to: "/practices/$practiceId", params: { practiceId: creada.id } });
  };

  return (
    <Pantalla
      titulo={copy.nuevaPractica.titulo}
      descripcion={copy.nuevaPractica.descripcion}
      volverA="/practices"
    >
      <form onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4">
        {errorLocal !== null && <Alert>{errorLocal}</Alert>}
        {crear.isError && <Alert>{mensajeDeError(crear.error)}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{copy.nuevaPractica.cancha}</span>
            <select
              value={cancha ?? ""}
              onChange={(evento) => setFieldId(evento.target.value)}
              className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
            >
              {(canchas.data ?? []).map((una) => (
                <option key={una.id} value={una.id}>
                  {una.name}
                </option>
              ))}
            </select>
          </label>

          <Campo etiqueta={copy.nuevaPractica.fecha} tipo="date" valor={dia} onCambio={setDia} />
          <Campo etiqueta={copy.nuevaPractica.desde} tipo="time" valor={desde} onCambio={setDesde} />
          <Campo etiqueta={copy.nuevaPractica.hasta} tipo="time" valor={hasta} onCambio={setHasta} />

          <TextField
            label={copy.nuevaPractica.chukkers}
            type="number"
            value={chukkers}
            onChange={(evento) => setChukkers(evento.target.value)}
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{copy.nuevaPractica.handicap}</span>
            <select
              value={handicapType}
              onChange={(evento) =>
                setHandicapType(evento.target.value === "international" ? "international" : "club")
              }
              className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
            >
              <option value="club">{copy.practicas.handicapUsado.club}</option>
              <option value="international">{copy.practicas.handicapUsado.international}</option>
            </select>
          </label>

          <TextField
            label={copy.nuevaPractica.objetivo}
            type="number"
            value={objetivo}
            onChange={(evento) => setObjetivo(evento.target.value)}
          />
          <TextField
            label={copy.nuevaPractica.minimo}
            type="number"
            value={minimo}
            onChange={(evento) => setMinimo(evento.target.value)}
          />

          <Campo etiqueta={copy.practicas.cierra} tipo="time" valor={cierre} onCambio={setCierre} />
          <Campo
            etiqueta={copy.practicas.decide}
            tipo="time"
            valor={decision}
            onCambio={setDecision}
            ayuda={copy.nuevaPractica.decisionAyuda}
          />
        </div>

        <div>
          <Button type="submit" cargando={crear.isPending}>
            {crear.isPending ? copy.nuevaPractica.creando : copy.nuevaPractica.crear}
          </Button>
        </div>
      </form>
    </Pantalla>
  );
}

function Campo({
  etiqueta,
  tipo,
  valor,
  onCambio,
  ayuda,
}: {
  etiqueta: string;
  tipo: "date" | "time";
  valor: string;
  onCambio: (valor: string) => void;
  ayuda?: string;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{etiqueta}</span>
      <input
        type={tipo}
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        className="min-h-tap rounded-lg border border-sage bg-white px-3 text-base"
      />
      {ayuda !== undefined && <span className="text-sm text-muted">{ayuda}</span>}
    </label>
  );
}
