import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  AssignRoleRequest,
  AuditEntryResponse,
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse,
  UserResponse,
} from "@polo/contracts";
import { api } from "../../../lib/api-client.js";
import { queryKeys } from "../../../lib/query-keys.js";

export interface FiltrosDeUsuarios {
  q?: string | undefined;
  status?: string | undefined;
  role?: string | undefined;
  organizationId?: string | undefined;
  page?: number | undefined;
}

/**
 * Convierte los filtros en query params, **omitiendo los vacíos**.
 *
 * `?status=` con valor vacío no es lo mismo que no mandar `status`: el API lo recibiría como
 * cadena vacía y filtraría por un estado que no existe, devolviendo cero resultados sin que nada
 * falle. Es el fallo típico de un `<select>` con opción «Todos».
 */
function comoParametros(filtros: FiltrosDeUsuarios): string {
  const parametros = new URLSearchParams();

  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== "" && valor !== null) {
      parametros.set(clave, String(valor));
    }
  }

  return parametros.toString();
}

export function useUsuarios(filtros: FiltrosDeUsuarios): UseQueryResult<UserListResponse, Error> {
  const parametros = comoParametros(filtros);

  return useQuery({
    queryKey: queryKeys.usuarios.lista(filtros as Record<string, string | undefined>),
    queryFn: () => api<UserListResponse>(`/users${parametros === "" ? "" : `?${parametros}`}`),
    // Al cambiar de página, se conserva lo anterior en pantalla mientras llega lo nuevo: sin esto
    // la tabla desaparece y la página «salta», que es lo que hace perder el hilo al revisar una
    // lista larga.
    placeholderData: (anterior) => anterior,
  });
}

/** La dirección de descarga del CSV, con **los mismos filtros** que la tabla (T-059). */
export function urlDeExportacion(filtros: FiltrosDeUsuarios): string {
  // La exportación **no lleva página**: trae todo lo que cumple el filtro (T-059). Mandarla
  // recortaría el CSV a 25 filas sin que quien lo abre pueda notarlo.
  const parametros = comoParametros({ ...filtros, page: undefined });

  return `/api/users/export${parametros === "" ? "" : `?${parametros}`}`;
}

export function useUsuario(id: string): UseQueryResult<UserResponse, Error> {
  return useQuery({
    queryKey: queryKeys.usuarios.detalle(id),
    queryFn: () => api<UserResponse>(`/users/${id}`),
  });
}

export function useCrearUsuario(): UseMutationResult<UserResponse, Error, CreateUserRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: CreateUserRequest) => api<UserResponse>("/users", { method: "POST", body: datos }),
    onSuccess: async () => {
      // Invalidar la raíz alcanza al listado con cualquier filtro y a los detalles: es para lo que
      // las claves están jerarquizadas (`docs/04` §4).
      await queryClient.invalidateQueries({ queryKey: queryKeys.usuarios.todos });
    },
  });
}

export function useEditarUsuario(id: string): UseMutationResult<UserResponse, Error, UpdateUserRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cambios: UpdateUserRequest) =>
      api<UserResponse>(`/users/${id}`, { method: "PATCH", body: cambios }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.usuarios.todos });
    },
  });
}

/**
 * Las acciones sobre una cuenta: suspender, reactivar, archivar, restaurar, reinvitar.
 *
 * Una sola función porque todas son `POST /users/:id/<accion>` sin cuerpo y todas invalidan lo
 * mismo. Tenerlas separadas sería cinco veces el mismo código con una palabra distinta.
 */
export type AccionDeCuenta = "suspend" | "reactivate" | "archive" | "restore" | "invite";

export function useAccionDeCuenta(id: string): UseMutationResult<unknown, Error, AccionDeCuenta> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accion: AccionDeCuenta) => api<unknown>(`/users/${id}/${accion}`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.usuarios.todos });
    },
  });
}

export function useOtorgarRol(id: string): UseMutationResult<unknown, Error, AssignRoleRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (datos: AssignRoleRequest) =>
      api<unknown>(`/users/${id}/roles`, { method: "POST", body: datos }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.usuarios.todos });
    },
  });
}

export function useRetirarRol(id: string): UseMutationResult<undefined, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roleAssignmentId: string) =>
      api<undefined>(`/users/${id}/roles/${roleAssignmentId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.usuarios.todos });
    },
  });
}

/** El historial de auditoría **de esa persona** (T-136, HU-010-08). */
export function useAuditoriaDe(personId: string): UseQueryResult<AuditEntryResponse[], Error> {
  return useQuery({
    queryKey: ["audit-log", personId],
    queryFn: () => api<AuditEntryResponse[]>(`/audit-log?entityId=${encodeURIComponent(personId)}`),
  });
}
