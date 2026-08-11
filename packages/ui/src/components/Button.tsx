import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * El botón de la plataforma (`docs/04` §2 y §6).
 *
 * **`min-h-tap` no es decoración**: 44 px es el objetivo táctil mínimo, y esta pantalla se usa
 * sobre todo desde un celular al borde de la cancha, con guantes o con la mano sucia. Un botón de
 * 32 px se falla, y fallar el botón de «postularme» es no jugar.
 *
 * **`type="button"` por defecto**, al revés que el HTML. El default del navegador es `submit`, así
 * que un botón de «cancelar» dentro de un formulario lo envía — un fallo clásico que aparece
 * cuando alguien ya está usando el producto y no cuando se escribe.
 *
 * No usa Radix porque un `<button>` nativo ya trae foco, teclado y semántica; el primitivo entra
 * cuando haga falta algo que el HTML no da (un diálogo, un select con teclado).
 */
type Variante = "primaria" | "secundaria" | "texto";

const ESTILOS: Record<Variante, string> = {
  primaria: "bg-coquelicot text-white hover:opacity-90",
  secundaria: "border border-brunswick text-brunswick hover:bg-brunswick/5",
  texto: "text-brunswick underline underline-offset-4 hover:opacity-80",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  /** Deshabilita y anuncia la espera. El texto lo pone quien llama: sólo él sabe qué se espera. */
  cargando?: boolean;
  children: ReactNode;
}

export function Button({
  variante = "primaria",
  cargando = false,
  className = "",
  children,
  ...resto
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      // `aria-busy` y no sólo el texto: quien usa lector de pantalla tiene que enterarse de que
      // algo está en curso sin depender de que el texto del botón haya cambiado.
      aria-busy={cargando}
      disabled={cargando || resto.disabled === true}
      className={`inline-flex min-h-tap items-center justify-center rounded-lg px-5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${ESTILOS[variante]} ${className}`}
      {...resto}
    >
      {children}
    </button>
  );
}
