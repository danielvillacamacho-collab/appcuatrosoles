/**
 * docs/04-frontend-conventions.md §7 — todo el copy visible al usuario vive aquí.
 * Ningún componente escribe un string visible inline.
 *
 * No es sólo por una futura internacionalización: es lo que permite que el club lea y corrija el
 * lenguaje del producto sin tocar código.
 */
export const copy = {
  app: {
    title: "Cuatro Soles",
    scaffoldNotice: "Plataforma en construcción — módulo de identidad en curso (specs/010).",
  },

  comun: {
    cargando: "Cargando…",
    salir: "Cerrar sesión",
  },

  /**
   * Los roles, en el idioma del club.
   *
   * `groom` es «petisero» y no «mozo de cuadra»: es la palabra que se usa en la cancha, y el
   * producto tiene que hablar como habla el club (brandbook §6, voz «cálida y auténtica»).
   */
  roles: {
    superadmin: "Superadministrador",
    club_admin: "Administrador del club",
    commissioner: "Comisario",
    player: "Jugador",
    organization_admin: "Administrador de organización",
    instructor: "Instructor",
    groom: "Petisero",
    treasurer: "Tesorero",
  } as Record<string, string>,

  panel: {
    saludo: "Hola",
    tusRoles: "Lo que puedes hacer en el club",
    sinRoles: "Todavía no te asignaron un rol. Comunícate con la administración del club.",
    categoria: "Categoría de membresía",
    sinCategoria: "Sin categoría asignada",
    organizaciones: "Escuelas y organizaciones",
    misCosas: "Lo tuyo",
    miPerfil: "Mi perfil",
    misDispositivos: "Mis dispositivos",
    misAvisos: "Mis avisos",
    misPerfilesACargo: "Perfiles a cargo",
    administracion: "Administración",
    usuarios: "Usuarios del club",
  },

  ingreso: {
    titulo: "Ingresar",
    subtitulo: "Entra con el correo que le diste al club.",
    correo: "Correo",
    contrasena: "Contraseña",
    recordarme: "Mantener la sesión abierta en este dispositivo",
    entrar: "Entrar",
    entrando: "Entrando…",
    olvide: "Olvidé mi contraseña",
    // Los errores de formato los dice la interfaz, no Zod: los mensajes de Zod están en inglés y
    // describen el esquema («Invalid email»), no lo que la persona tiene que hacer.
    correoInvalido: "Escribe un correo válido, como maria@ejemplo.com.",
    contrasenaRequerida: "Escribe tu contraseña.",
  },

  invitacion: {
    titulo: "Define tu contraseña",
    subtitulo: "Te crearon una cuenta en el club. Elige una contraseña para entrar.",
    sinToken:
      "Este enlace está incompleto. Ábrelo desde el correo que te envió el club, o pídele que te lo reenvíe.",
    nombre: "Nombre completo",
    nombreAyuda: "Sólo si el club no lo puso ya. Si lo dejaste en blanco, se conserva el que tienen.",
    nombreInvalido: "Escribe tu nombre completo, o déjalo en blanco.",
    telefono: "Teléfono",
    telefonoInvalido: "Ese teléfono es demasiado largo.",
    contrasena: "Contraseña nueva",
    confirmacion: "Repite la contraseña",
    noCoinciden: "Las dos contraseñas no coinciden.",
    guardar: "Guardar y continuar",
    guardando: "Guardando…",
    yaTengoCuenta: "Ya tengo contraseña, quiero ingresar",
  },

  olvide: {
    titulo: "Olvidé mi contraseña",
    subtitulo: "Te enviamos un enlace para que definas una nueva.",
    correo: "Correo",
    enviar: "Enviar el enlace",
    enviando: "Enviando…",
    volver: "Volver a ingresar",
    // El mismo texto exista o no la cuenta (R-010-07, P-12). Si dijera «te enviamos un correo» sólo
    // cuando la cuenta existe, esta pantalla sería un buscador de socios del club.
    listo:
      "Si esa cuenta existe, le enviamos un correo con el enlace para restablecer la contraseña. Revisa tu bandeja y la carpeta de no deseados.",
  },

  /**
   * Los errores del API, por su `code` (T-122, `plan.md` §9.3).
   *
   * **El texto lo pone la interfaz, no el servidor.** El API responde con mensajes en español y
   * correctos, pero están escritos sin saber en qué pantalla van a aparecer: «La operación no
   * cumple una regla del club» es cierto y no le sirve a nadie que está tratando de entrar. Aquí
   * cada código dice **qué pasó y qué hacer**, y el club puede corregir esas frases sin que nadie
   * toque un componente.
   *
   * Un código sin traducción no rompe la pantalla —cae en `generico`— pero **avisa en consola**,
   * para que la falta se note escribiendo la función y no meses después en producción.
   */
  errores: {
    generico: "No pudimos completar la operación. Vuelve a intentar en un momento.",
    sinRed: "No pudimos contactar al servidor. Revisa tu conexión e intenta de nuevo.",

    // ── Genéricos por estado (`docs/03` §3) ──────────────────────────────────
    UNAUTHENTICATED: "Tu sesión terminó. Vuelve a iniciar sesión para continuar.",
    FORBIDDEN: "No tienes permiso para hacer esto.",
    NOT_FOUND: "No encontramos lo que buscas.",
    VALIDATION_FAILED: "Revisa los datos: hay algo que no está bien.",
    CONFLICT: "Ya existe algo que impide completar esta operación.",
    UNPROCESSABLE: "Esta operación no cumple una regla del club.",
    METHOD_NOT_ALLOWED: "Esta operación no está disponible.",
    RATE_LIMITED: "Demasiados intentos. Espera un momento y vuelve a intentar.",
    INTERNAL_ERROR: "Ocurrió un error inesperado. Si vuelve a pasar, repórtalo con el código de la solicitud.",
    RESPUESTA_INESPERADA: "El servidor respondió algo que no entendimos. Vuelve a intentar.",

    // ── Ingreso y contraseñas ────────────────────────────────────────────────
    // Uno solo para «no existe» y «contraseña mala», porque el API responde uno solo a propósito:
    // dos mensajes distintos convertirían la pantalla de ingreso en un buscador de cuentas del
    // club (R-010-07, P-12). Si aquí se separaran, se desharía esa protección desde el frontend.
    CREDENTIALS_INVALID: "Correo o contraseña incorrectos.",
    ACCOUNT_LOCKED: "Tu cuenta está bloqueada por varios intentos fallidos. Espera unos minutos y vuelve a intentar.",
    INVITATION_PENDING: "Todavía no has definido tu contraseña. Busca el correo de invitación del club o pídele que te lo reenvíe.",
    ACCOUNT_SUSPENDED: "Tu acceso está suspendido. Comunícate con la administración del club.",
    ACCOUNT_ARCHIVED: "Tu cuenta ya no está activa. Comunícate con la administración del club.",
    PASSWORD_POLICY:
      "Tu contraseña debe tener al menos 8 caracteres, incluir letras y números, no ser una de las más usadas y no contener tu correo.",
    INVITATION_LINK_INVALID: "Este enlace de invitación ya no sirve. Pídele al club que te lo reenvíe.",
    RESET_LINK_INVALID: "Este enlace para restablecer tu contraseña ya no sirve. Solicita uno nuevo.",
    EMAIL_CHANGE_LINK_INVALID: "Este enlace para confirmar tu correo ya no sirve. Vuelve a solicitar el cambio.",
    EMAIL_IN_USE: "Ese correo ya está en uso por otra cuenta.",
    CSRF_TOKEN_INVALIDO: "Tu sesión expiró mientras llenabas el formulario. Recarga la página e intenta de nuevo.",

    // ── Usuarios y roles ─────────────────────────────────────────────────────
    email_en_uso: "Ya existe una cuenta con ese correo.",
    la_persona_ya_tiene_cuenta: "Esa persona ya tiene una cuenta en el club.",
    la_cuenta_ya_no_esta_invitada: "Esa cuenta ya no está pendiente de invitación.",
    ya_tiene_ese_rol: "Esa persona ya tiene ese rol.",
    no_puedes_hacerte_esto_a_ti_mismo: "No puedes hacer esto sobre tu propia cuenta.",
    categoria_desconocida: "Esa categoría de membresía no existe en el club.",

    // ── Familia y menores ────────────────────────────────────────────────────
    no_cabe_en_perfil_de_menor: "Por su edad, esta persona necesita su propia cuenta en vez de un perfil a cargo.",
    nadie_es_acudiente_de_si_mismo: "Una persona no puede ser acudiente de sí misma.",
    no_eres_su_acudiente: "Sólo un acudiente vigente puede hacer esto por esta persona.",
    waiver_no_aceptado: "Falta aceptar la exención de responsabilidad para poder continuar.",

    // ── Club, temporadas y configuración ─────────────────────────────────────
    nombre_en_uso: "Ya existe algo con ese nombre en el club.",
    codigo_en_uso: "Ese código ya está en uso.",
    slug_en_uso: "Ese subdominio ya está tomado.",
    slug_reservado: "Ese subdominio está reservado. Elige otro.",
    slug_formato_invalido: "El subdominio sólo admite letras, números y guiones.",
    slug_muy_corto: "El subdominio es demasiado corto.",
    slug_muy_largo: "El subdominio es demasiado largo.",
    slug_vacio: "El subdominio no puede quedar vacío.",
    timezone_desconocida: "Esa zona horaria no existe.",
    fechas_incoherentes: "La fecha de fin no puede ser anterior a la de inicio.",
    temporada_solapada: "Ya hay una temporada en esas fechas.",
    temporada_ya_cerrada: "Esa temporada ya está cerrada.",
    clave_desconocida: "Esa opción de configuración no existe.",
    tipo_invalido: "El valor no es del tipo que espera esta opción.",
    valor_no_admitido: "Ese valor no está permitido para esta opción.",
    ambito_demasiado_especifico: "Esta opción se define para todo el club, no por organización.",
  },
} as const;
