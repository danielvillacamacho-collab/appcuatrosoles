import { createFileRoute } from "@tanstack/react-router";
import { copy } from "../i18n/es-CO.js";

/**
 * Provisional: la ruta raíz la reemplaza el panel propio (T-127), y quien llegue sin sesión
 * terminará en `/login` (T-124, T-125). Existe para que la aplicación tenga a dónde ir mientras
 * esas dos tareas no están.
 */
export const Route = createFileRoute("/")({ component: Inicio });

function Inicio(): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-cream px-6 text-center text-ink">
      <h1 className="text-2xl font-bold">{copy.app.title}</h1>
      <p className="text-muted">{copy.app.scaffoldNotice}</p>
    </main>
  );
}
