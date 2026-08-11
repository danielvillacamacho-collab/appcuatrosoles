import type { ReactNode } from "react";

/**
 * El aviso de error de un formulario o de una pantalla (`docs/04` §6).
 *
 * `role="alert"` es lo único que hace que esto sirva de verdad: sin él, quien usa lector de
 * pantalla no se entera de que apareció un mensaje —el foco sigue donde estaba— y vuelve a
 * presionar el botón sin saber por qué no pasó nada.
 */
export function Alert({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <p
      role="alert"
      className="rounded-lg border border-coquelicot bg-coquelicot/10 px-4 py-3 text-sm font-medium text-ink"
    >
      {children}
    </p>
  );
}
