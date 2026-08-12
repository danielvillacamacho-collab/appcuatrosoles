import { z } from "zod";

/**
 * docs/03-api-conventions.md §2 — forma única de error en todo el API. `code` es estable y
 * forma parte del contrato; `message` puede cambiar de redacción sin romper al cliente.
 */
export const ApiErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponse>;

/**
 * Todos los códigos de error que el API puede responder hoy (T-122).
 *
 * Vive en el contrato y no en el API porque **es el contrato**: `docs/03` §2 declara el `code`
 * estable y ramificable por el cliente. Teniéndolo aquí, la interfaz puede comprobar en un test
 * que ninguno se quedó sin texto en español, en vez de descubrirlo cuando un usuario vea
 * «ocurrió un error» sin saber qué hacer.
 *
 * **Agregar un código al API sin agregarlo aquí rompe ese test a propósito.**
 */
export const CODIGOS_DE_ERROR = [
  // Genéricos por estado HTTP (`docs/03` §3).
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "CONFLICT",
  "UNPROCESSABLE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",

  // Identidad y acceso (`specs/010`).
  "CREDENTIALS_INVALID",
  "ACCOUNT_LOCKED",
  "INVITATION_PENDING",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_ARCHIVED",
  "PASSWORD_POLICY",
  "INVITATION_LINK_INVALID",
  "RESET_LINK_INVALID",
  "EMAIL_CHANGE_LINK_INVALID",
  "EMAIL_IN_USE",
  "CSRF_TOKEN_INVALIDO",
  "email_en_uso",
  "la_persona_ya_tiene_cuenta",
  "la_cuenta_ya_no_esta_invitada",
  "ya_tiene_ese_rol",
  "no_puedes_hacerte_esto_a_ti_mismo",
  "categoria_desconocida",

  // Familia y menores.
  "no_cabe_en_perfil_de_menor",
  "nadie_es_acudiente_de_si_mismo",
  "no_eres_su_acudiente",
  "waiver_no_aceptado",

  // Canchas y calendario (`specs/040`).
  "cancha_ocupada",
  "nombre_de_cancha_en_uso",
  "cancha_no_disponible",
  "fuera_del_horario",
  "rango_invalido",

  // Handicaps (`specs/030`). Los cuatro rechazos del dominio, cada uno distinguible: la interfaz
  // tiene que poder decir cuál falló, no un «handicap inválido» que no le dice nada al comisario.
  "handicap_fuera_de_rango",
  "handicap_no_es_medio_gol",
  "handicap_sin_cambio",
  "handicap_sin_motivo",

  // Prácticas (`specs/050`).
  "practica_rango_invalido",
  "practica_minimo_mayor_que_objetivo",
  "practica_cierre_despues_de_decision",
  "practica_decision_despues_de_empezar",
  "practica_no_editable",
  "practica_ya_publicada",
  "postulacion_cerrada",
  "ya_estas_postulado",
  "no_estas_postulado",
  "supera_su_habilitacion",
  "practica_sin_nivel_declarado",
  "pareja_no_valida",

  // Club, temporadas y configuración (`specs/020`, `specs/140`).
  "nombre_en_uso",
  "codigo_en_uso",
  "slug_en_uso",
  "slug_reservado",
  "slug_formato_invalido",
  "slug_muy_corto",
  "slug_muy_largo",
  "slug_vacio",
  "timezone_desconocida",
  "fechas_incoherentes",
  "temporada_solapada",
  "temporada_ya_cerrada",
  "clave_desconocida",
  "tipo_invalido",
  "valor_no_admitido",
  "ambito_demasiado_especifico",
] as const;

export type CodigoDeError = (typeof CODIGOS_DE_ERROR)[number];
