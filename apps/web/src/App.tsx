import { copy } from "./i18n/es-CO.js";

/**
 * Placeholder de arranque — las rutas reales (login, calendario, prácticas) se agregan al
 * implementar specs/010 en adelante (docs/01-architecture.md §5, docs/04 §3). Esta pantalla
 * sólo confirma que el toolchain de apps/web compila y sirve algo.
 */
export function App(): React.JSX.Element {
  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "0.5rem",
        background: "var(--color-cream)",
        color: "var(--color-ink)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <h1>{copy.app.title}</h1>
      <p>{copy.app.scaffoldNotice}</p>
    </main>
  );
}
