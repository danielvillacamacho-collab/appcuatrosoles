import { useId, type InputHTMLAttributes, type ReactNode } from "react";

/**
 * Un campo de texto con su etiqueta y su error, atados como corresponde (`docs/04` §6).
 *
 * Existe para que **nadie tenga que acordarse de la accesibilidad**. Un `<input>` suelto con un
 * `<p>` rojo debajo se ve igual y no dice nada: quien usa lector de pantalla oye el campo, no oye
 * el error, y no entiende por qué el formulario no avanza. Aquí el `id` se genera solo, la
 * etiqueta lo apunta, y el error se anuncia con `aria-describedby` + `role="alert"`.
 *
 * **La etiqueta siempre está**, nunca un `placeholder` haciendo de etiqueta: el placeholder
 * desaparece al escribir, y entonces un formulario a medio llenar deja de decir qué es cada cosa.
 */
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Mensaje de error ya en español. `undefined` = el campo está bien. */
  error?: string | undefined;
  /** Texto de apoyo permanente: la política de contraseñas, el formato esperado. */
  ayuda?: ReactNode;
}

export function TextField({
  label,
  error,
  ayuda,
  className = "",
  ...resto
}: TextFieldProps): React.JSX.Element {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const descripciones = [ayuda === undefined ? undefined : idAyuda, error === undefined ? undefined : idError]
    .filter((valor) => valor !== undefined)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>

      <input
        id={id}
        aria-invalid={error !== undefined}
        {...(descripciones === "" ? {} : { "aria-describedby": descripciones })}
        className={`min-h-tap rounded-lg border bg-white px-3 text-base text-ink outline-none focus:ring-2 focus:ring-brunswick ${
          error === undefined ? "border-sage" : "border-coquelicot"
        } ${className}`}
        {...resto}
      />

      {ayuda !== undefined && (
        <p id={idAyuda} className="text-sm text-muted">
          {ayuda}
        </p>
      )}

      {error !== undefined && (
        // `role="alert"` para que el lector de pantalla lo anuncie cuando aparece, sin que la
        // persona tenga que volver al campo a buscarlo.
        <p id={idError} role="alert" className="text-sm font-medium text-coquelicot">
          {error}
        </p>
      )}
    </div>
  );
}
