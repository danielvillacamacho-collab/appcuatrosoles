import { Link } from "@tanstack/react-router";
import { copy } from "../i18n/es-CO.js";

/**
 * El marco de una pantalla con contenido (`docs/04` §2).
 *
 * **Mobile-first, con el escritorio como extensión y no como añadido.** El ancho crece por tramos:
 * en un celular el contenido ocupa todo; a partir de tablet se centra; en un monitor ancho llega
 * hasta donde el contenido lo justifica y no más. Una línea de texto de 1400 px es incómoda de
 * leer, así que «responsive» no es estirar todo hasta el borde.
 *
 * Dos anchos, y la diferencia es qué hay adentro:
 * - `lectura` — perfiles, formularios, fichas. Se queda estrecho porque son textos y campos.
 * - `tabla` — listados. Crece, porque las columnas necesitan aire y en un monitor se ven de un
 *   vistazo en vez de una debajo de otra.
 */
export function Pantalla({
  titulo,
  descripcion,
  ancho = "lectura",
  volverA = "/",
  acciones,
  children,
}: {
  titulo: string;
  descripcion?: string;
  ancho?: "lectura" | "tabla";
  volverA?: "/" | "/users";
  /** Botones de la cabecera. En móvil van debajo del título; en escritorio, a su lado. */
  acciones?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <main
      className={`mx-auto flex min-h-screen w-full flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 ${
        ancho === "tabla" ? "max-w-6xl" : "max-w-3xl"
      }`}
    >
      <div>
        {/* Un enlace y no `history.back()`: quien llegó por un enlace directo —el que le mandaron
            por WhatsApp— saldría del producto en vez de subir un nivel. */}
        <Link
          to={volverA}
          className="inline-flex min-h-tap items-center text-base font-medium text-brunswick underline underline-offset-4"
        >
          {volverA === "/" ? copy.comun.volverAlPanel : copy.comun.volverAUsuarios}
        </Link>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{titulo}</h1>
            {descripcion !== undefined && <p className="mt-1 text-muted">{descripcion}</p>}
          </div>

          {acciones !== undefined && <div className="flex flex-wrap gap-3">{acciones}</div>}
        </div>
      </div>

      {children}
    </main>
  );
}

/**
 * El marco de las pantallas sin sesión: ingreso, invitación, restablecimiento.
 *
 * Se queda centrado y estrecho **a propósito, también en escritorio**. Un formulario de dos campos
 * estirado a 1400 px no se lee mejor: se lee peor, porque la etiqueta queda a un metro del campo.
 * Lo que sí cambia con el tamaño es el aire alrededor.
 */
export function PantallaDeEntrada({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
