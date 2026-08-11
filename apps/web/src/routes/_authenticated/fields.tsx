import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FieldResponse } from "@polo/contracts";
import { Alert, Button, TextField } from "@polo/ui";
import { Pantalla } from "../../components/Pantalla.js";
import {
  useArchivarCancha,
  useCanchas,
  useCrearCancha,
  useEditarCancha,
} from "../../features/fields/api/useCanchas.js";
import { mensajeDeError } from "../../lib/error-message.js";
import { copy } from "../../i18n/es-CO.js";

/**
 * Las canchas del club (T-461, HU-040-01).
 *
 * Pantalla corta a propósito: un club tiene tres canchas y las toca dos veces al año. Lo que sí
 * está cuidado es lo irreversible — **archivar pide el clic en su propio botón** y la cancha
 * archivada muestra por qué ya no se puede programar en ella, en vez de desaparecer.
 */
export const Route = createFileRoute("/_authenticated/fields")({ component: Canchas });

function Canchas(): React.JSX.Element {
  const canchas = useCanchas(true);
  const [creando, setCreando] = useState(false);

  return (
    <Pantalla
      titulo={copy.canchas.titulo}
      descripcion={copy.canchas.descripcion}
      acciones={
        <Button variante="secundaria" onClick={() => setCreando((abierto) => !abierto)}>
          {copy.canchas.nueva}
        </Button>
      }
    >
      {creando && <FormularioDeCancha onListo={() => setCreando(false)} />}

      {canchas.isError && <Alert>{mensajeDeError(canchas.error)}</Alert>}
      {canchas.isPending && <p role="status">{copy.comun.cargando}</p>}

      <ul className="flex flex-col gap-3">
        {(canchas.data ?? []).map((cancha) => (
          <li key={cancha.id}>
            <FichaDeCancha cancha={cancha} />
          </li>
        ))}
      </ul>
    </Pantalla>
  );
}

function FormularioDeCancha({ onListo }: { onListo: () => void }): React.JSX.Element {
  const crear = useCrearCancha();
  const [nombre, setNombre] = useState("");
  const [superficie, setSuperficie] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const enviar = async (evento: React.FormEvent): Promise<void> => {
    evento.preventDefault();

    if (nombre.trim() === "") {
      setErrorLocal(copy.canchas.nombreInvalido);

      return;
    }

    setErrorLocal(null);
    await crear.mutateAsync({
      name: nombre.trim(),
      ...(superficie.trim() === "" ? {} : { surface: superficie.trim() }),
    });
    onListo();
  };

  return (
    <form
      onSubmit={(evento) => void enviar(evento)}
      className="flex flex-col gap-4 rounded-lg border border-sage bg-white/60 p-4"
      aria-label={copy.canchas.nueva}
    >
      {errorLocal !== null && <Alert>{errorLocal}</Alert>}
      {crear.isError && <Alert>{mensajeDeError(crear.error)}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={copy.canchas.nombre}
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
        />
        <TextField
          label={copy.canchas.superficie}
          value={superficie}
          onChange={(evento) => setSuperficie(evento.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" cargando={crear.isPending}>
          {crear.isPending ? copy.canchas.creando : copy.canchas.crear}
        </Button>
        <Button variante="texto" onClick={onListo}>
          {copy.comun.cancelar}
        </Button>
      </div>
    </form>
  );
}

function FichaDeCancha({ cancha }: { cancha: FieldResponse }): React.JSX.Element {
  const editar = useEditarCancha(cancha.id);
  const archivar = useArchivarCancha();
  const archivada = cancha.status === "archived";

  return (
    <article
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${
        archivada ? "border-sage/50 bg-white/30 text-muted" : "border-sage bg-white/60"
      }`}
    >
      <div>
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold">{cancha.name}</span>
          <EstadoDeCancha estado={cancha.status} />
        </p>
        {cancha.surface !== null && <p className="text-sm text-muted">{cancha.surface}</p>}
        {archivada && <p className="text-sm">{copy.canchas.archivadaAviso}</p>}
      </div>

      {!archivada && (
        <div className="flex flex-wrap gap-2">
          {editar.isError && <Alert>{mensajeDeError(editar.error)}</Alert>}
          {cancha.status === "active" ? (
            <Button
              variante="secundaria"
              onClick={() => void editar.mutateAsync({ status: "maintenance" })}
              cargando={editar.isPending}
            >
              {copy.canchas.ponerEnMantenimiento}
            </Button>
          ) : (
            <Button
              variante="secundaria"
              onClick={() => void editar.mutateAsync({ status: "active" })}
              cargando={editar.isPending}
            >
              {copy.canchas.reactivar}
            </Button>
          )}
          <Button
            variante="texto"
            onClick={() => void archivar.mutateAsync(cancha.id)}
            cargando={archivar.isPending && archivar.variables === cancha.id}
          >
            {copy.canchas.archivar}
          </Button>
        </div>
      )}
    </article>
  );
}

function EstadoDeCancha({ estado }: { estado: string }): React.JSX.Element {
  const colores: Record<string, string> = {
    active: "bg-brunswick text-bone",
    maintenance: "bg-jonquil text-ink",
    archived: "bg-sage text-ink",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${colores[estado] ?? "bg-sage"}`}>
      {copy.canchas.estados[estado] ?? estado}
    </span>
  );
}
