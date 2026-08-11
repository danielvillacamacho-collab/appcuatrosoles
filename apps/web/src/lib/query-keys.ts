/**
 * Las claves de TanStack Query, en un solo lugar (T-121, `docs/04` §4).
 *
 * **El problema que resuelve es real y silencioso**: invalidar `["users"]` cuando la consulta se
 * registró como `["users", filtros]` no da error, no rompe nada y no refresca la pantalla. Se
 * descubre semanas después, cuando alguien dice «tuve que recargar para ver el usuario nuevo».
 * Con las claves centralizadas, quien invalida y quien consulta usan la misma función.
 *
 * La jerarquía es a propósito: `usuarios.todos` es prefijo de `usuarios.lista(filtros)` y de
 * `usuarios.detalle(id)`, así que invalidar la raíz alcanza a todo lo que cuelgue de ella. Es lo
 * que hace que tras crear un usuario baste con una línea.
 */
export const queryKeys = {
  /** Quién soy: la respuesta a «¿hay sesión?» (`plan.md` §9.3.a). */
  yo: ["me"] as const,
  misSesiones: ["me", "sessions"] as const,
  misAvisos: ["me", "notification-preferences"] as const,
  misDependientes: ["me", "dependents"] as const,

  /** El club del subdominio. Público: se consulta antes de tener sesión. */
  club: ["club"] as const,

  usuarios: {
    todos: ["users"] as const,
    lista: (filtros: Record<string, string | undefined> = {}) => ["users", "list", filtros] as const,
    detalle: (id: string) => ["users", "detail", id] as const,
  },

  organizaciones: ["organizations"] as const,
  categorias: ["membership-categories"] as const,
} as const;
