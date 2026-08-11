import { Link } from "@tanstack/react-router";
import { copy } from "../../../i18n/es-CO.js";

/**
 * El marco de las pantallas de la cuenta propia (T-130 a T-133).
 *
 * Lo que aporta es **la salida**: en un celular no hay botón de «atrás» visible dentro de la
 * aplicación, y quien entra a «mis dispositivos» tiene que poder volver sin usar el gesto del
 * sistema. Un enlace, no un `history.back()`: si llegó por un enlace directo, atrás lo saca del
 * producto.
 */
export function Pantalla({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 bg-cream px-6 py-8 text-ink">
      <div>
        <Link
          to="/"
          className="inline-flex min-h-tap items-center text-base font-medium text-brunswick underline underline-offset-4"
        >
          {copy.comun.volverAlPanel}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{titulo}</h1>
        {descripcion !== undefined && <p className="mt-1 text-muted">{descripcion}</p>}
      </div>

      {children}
    </main>
  );
}
