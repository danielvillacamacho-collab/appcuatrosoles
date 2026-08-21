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
    /**
     * Acompaña al mensaje genérico de error, y sólo a ése.
     *
     * Va en `comun` y no en `errores` porque `errores` es un **mapa de código de error a texto** y
     * nada más: meterle una función rompe ese contrato, y hay un test que lo comprueba.
     */
    referenciaDeError: (id: string) => `Si vuelve a pasar, repórtalo con este código: ${id}`,

    cargando: "Cargando…",
    salir: "Cerrar sesión",
    volverAlPanel: "← Volver al panel",
    volverAUsuarios: "← Volver a usuarios",
    guardar: "Guardar",
    guardando: "Guardando…",
    guardado: "Guardado.",
    cancelar: "Cancelar",
    reintentar: "Reintentar",
    recargar: "Recargar la página",
    noSePudoCargar: "No pudimos cargar esta información.",
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

  practicas: {
    titulo: "Prácticas",
    descripcion: "Qué hay programado esta semana, y si estás dentro.",
    ninguna: "No hay prácticas publicadas por ahora.",
    nueva: "Nueva práctica",
    /** Lo que responde «¿preparo los caballos?». */
    estoyDentro: "Estás dentro",
    estoyEnEspera: (posicion: number) => `En lista de espera · ${posicion}.º`,
    noEstoy: "No te has postulado",
    cupos: (dentro: number, objetivo: number) => `${dentro} de ${objetivo} puestos`,
    enEspera: (cuantos: number) => `${cuantos} en lista de espera`,
    chukkers: (cuantos: number) => `${cuantos} chukkers`,
    cierra: "Cierran las postulaciones",
    decide: "Se decide",
    postularme: "Postularme",
    postulando: "Postulando…",
    retirarme: "Retirarme",
    chukkersQueCubro: "¿Cuántos chukkers puedes cubrir?",
    chukkersAyuda: "Según cuántos caballos vas a llevar.",
    compartirPuesto: "Comparto puesto con",
    compartirAyuda: "Opcional. La pareja no cuenta hasta que la otra persona acepte.",
    parejaPendiente: (nombre: string) => `Le propusiste compartir puesto a ${nombre}. Falta que acepte.`,
    parejaFormada: (nombre: string) => `Compartes puesto con ${nombre}.`,
    aceptarPareja: (nombre: string) => `${nombre} te propuso compartir puesto`,
    aceptar: "Aceptar",
    postulados: "Quiénes van",
    sinPostulados: "Todavía no se ha postulado nadie.",
    volver: "Volver a prácticas",
    estados: {
      draft: "Borrador",
      published: "Publicada",
      confirmed: "Confirmada",
      cancelled: "Cancelada",
    } as Record<string, string>,
    handicapUsado: {
      international: "Handicap internacional",
      club: "Handicap del club",
    } as Record<string, string>,
    rangoSugerido: (desde: string, hasta: string) => `Sugerida para ${desde} a ${hasta} goles`,
    nivelMaximo: (nivel: string) => `Nivel máximo: ${nivel} goles`,
  },

  nuevaPractica: {
    titulo: "Nueva práctica",
    descripcion: "Se crea en borrador. Publicarla es lo que reserva la cancha.",
    cancha: "Cancha",
    fecha: "Fecha",
    desde: "Hora de inicio",
    hasta: "Hora de fin",
    chukkers: "Chukkers",
    handicap: "Qué handicap se usa",
    objetivo: "Jugadores objetivo",
    minimo: "Mínimo para que se haga",
    cierre: "Hora de cierre de postulaciones",
    decision: "Hora de decisión",
    decisionAyuda: "A esta hora el sistema confirma o cancela solo, y le avisa a todos.",
    crear: "Crear en borrador",
    creando: "Creando…",
    publicar: "Publicar",
    publicando: "Publicando…",
    cancelar: "Cancelar la práctica",
    motivoCancelacion: "Motivo",
    camposIncompletos: "Revisa los campos: falta algo o las horas no son coherentes.",
  },

  handicapsDelClub: {
    titulo: "Handicaps del club",
    descripcion: "Con cuánto juega cada quien. El comisario es el único que puede cambiarlo.",
    tipo: "Qué handicap ver",
    deTotal: (pagina: number, paginas: number, total: number) =>
      `Página ${pagina} de ${paginas} · ${total} personas`,
    anterior: "Anterior",
    siguiente: "Siguiente",
    paginacion: "Paginación",
  },

  handicaps: {
    titulo: "Handicaps",
    internacional: "Internacional",
    delClub: "Del club",
    /** −2 es un handicap real; «sin calificar» es otra cosa (R-030-05). */
    sinCalificar: "Sin calificar",
    sinCalificarAyuda: "Nadie lo ha calificado todavía. Juega como −2 hasta que el comisario lo fije.",
    fijar: "Fijar handicap",
    verHistorial: "Ver historial",
    historial: "Historial de handicap",
    historialVacio: "Nunca ha sido calificado: no hay cambios que mostrar.",
    // El comisario escribe goles —«2,5»—, no medios goles. La conversión es del código.
    nuevoValor: "Nuevo handicap (en goles)",
    nuevoValorAyuda: "De −2 a 10, en medios goles: 2 o 2,5, no 2,3.",
    motivo: "Motivo del cambio",
    motivoAyuda: "Queda en el historial. Es lo que va a leer quien pregunte con cuánto estaba jugando.",
    motivoRequerido: "Escribe el motivo del cambio.",
    valorInvalido: "El handicap va de −2 a 10, en medios goles.",
    guardar: "Guardar",
    guardando: "Guardando…",
    cambio: (anterior: string, nuevo: string) => `${anterior} → ${nuevo}`,
    porQuien: (quien: string) => `por ${quien}`,
    tipos: {
      international: "Internacional",
      club: "Del club",
    } as Record<string, string>,
  },

  calendario: {
    titulo: "Calendario de canchas",
    descripcion: "Qué hay programado en cada cancha, y qué está libre.",
    diaAnterior: "← Día anterior",
    diaSiguiente: "Día siguiente →",
    hoy: "Hoy",
    // Lo ajeno y privado. La palabra sola, sin tipo ni nombre: es la promesa de R-040-07.
    ocupado: "Ocupado",
    libreTodoElDia: "Libre todo el día",
    libreEntre: (desde: string, hasta: string) => `Libre de ${desde} a ${hasta}`,
    bloquear: "Bloquear una franja",
    levantarBloqueo: "Levantar bloqueo",
    tipos: {
      practice: "Práctica",
      lesson: "Clase",
      tournament_match: "Partido de copa",
      stick_and_ball: "Taqueo",
      coaching: "Entrenamiento",
      maintenance: "Mantenimiento",
      block: "Bloqueo",
    } as Record<string, string>,
  },

  bloquearFranja: {
    titulo: "Bloquear una franja",
    descripcion: "Nada podrá programarse en la cancha mientras dure el bloqueo.",
    cancha: "Cancha",
    desde: "Desde",
    hasta: "Hasta",
    motivo: "Motivo",
    motivoAyuda: "Riego, mantenimiento, cancha impracticable… La siguiente persona que quiera programar aquí lo va a leer.",
    motivoRequerido: "Escribe el motivo del bloqueo.",
    horaInvalida: "Revisa las horas: el fin debe ser posterior al inicio.",
    bloquear: "Bloquear",
    bloqueando: "Bloqueando…",
  },

  canchas: {
    titulo: "Canchas",
    descripcion: "Las canchas del club: se archivan, nunca se borran.",
    nueva: "Nueva cancha",
    nombre: "Nombre",
    nombreInvalido: "Escribe el nombre de la cancha.",
    superficie: "Superficie",
    notas: "Notas de capacidad",
    crear: "Crear cancha",
    creando: "Creando…",
    ponerEnMantenimiento: "Poner en mantenimiento",
    reactivar: "Reactivar",
    archivar: "Archivar",
    archivadaAviso: "Archivada: no admite reservas nuevas. Su historia se conserva.",
    estados: {
      active: "Activa",
      maintenance: "En mantenimiento",
      archived: "Archivada",
    } as Record<string, string>,
  },

  usuarios: {
    titulo: "Usuarios del club",
    descripcion: "Busca, filtra y administra las cuentas.",
    buscar: "Buscar por nombre",
    estado: "Estado",
    rol: "Rol",
    organizacion: "Organización",
    todos: "Todos",
    exportar: "Exportar a CSV",
    nuevo: "Crear o invitar",
    ninguno: "No hay usuarios que cumplan ese filtro.",
    // «1–25 de 137»: sin el total, lo único que se puede mostrar es «siguiente», y nadie sabe si
    // el club tiene treinta socios o tres mil.
    rango: (desde: number, hasta: number, total: number) => `${desde}–${hasta} de ${total}`,
    anterior: "Anterior",
    siguiente: "Siguiente",
    estados: {
      invited: "Invitado",
      active: "Activo",
      suspended: "Suspendido",
      archived: "Archivado",
    } as Record<string, string>,
    invitadoDesde: "Invitación enviada el",
    sinCategoria: "Sin categoría",
    columnaNombre: "Persona",
    columnaCategoria: "Categoría",
  },

  nuevoUsuario: {
    titulo: "Crear o invitar",
    descripcion: "Con el correo alcanza: la persona completa sus datos al aceptar la invitación.",
    correo: "Correo",
    nombre: "Nombre completo",
    nombreAyuda: "Opcional. Si lo dejas en blanco, lo pone la persona al aceptar.",
    telefono: "Teléfono",
    categoria: "Categoría de membresía",
    organizacion: "Organización",
    organizacionAyuda: "Obligatoria si le das un rol de organización.",
    roles: "Roles",
    // El selector muestra sólo lo que quien lo usa puede otorgar (R-010-04): ofrecer un rol que el
    // API va a rechazar es hacer perder el tiempo dos veces.
    rolesAyuda: "Sólo aparecen los roles que puedes otorgar.",
    crear: "Crear e invitar",
    creando: "Creando…",
    creado: "Listo. Le enviamos la invitación a",
  },

  fichaUsuario: {
    volver: "← Volver a usuarios",
    cargando: "Cargando…",
    estado: "Estado",
    correo: "Correo de acceso",
    telefono: "Teléfono",
    categoria: "Categoría de membresía",
    organizaciones: "Organizaciones",
    roles: "Roles",
    otorgarRol: "Otorgar rol",
    retirar: "Retirar",
    acciones: "Acciones",
    suspender: "Suspender",
    reactivar: "Reactivar",
    archivar: "Archivar",
    restaurar: "Restaurar",
    reinvitar: "Reenviar invitación",
    reinvitada: "Invitación reenviada.",
    historial: "Historial de esta persona",
    sinHistorial: "Todavía no hay acciones registradas.",
    porElSistema: "el sistema",
    // Nadie puede suspenderse ni archivarse a sí mismo (R-010-05). El API lo rechaza igual; aquí
    // se esconde el botón para no ofrecer algo que va a fallar.
    esTuCuenta: "Esta es tu cuenta: las acciones sobre ella las hace otro administrador.",
  },

  perfil: {
    titulo: "Mi perfil",
    descripcion: "Lo que puedes cambiar tú, y lo que administra el club.",
    // La distinción visual entre editable y sólo lectura es requisito de `docs/04`: sin ella, la
    // persona intenta corregir su categoría de membresía y no entiende por qué no puede.
    editable: "Puedes cambiarlo",
    soloLectura: "Lo administra el club",
    nombre: "Nombre",
    telefono: "Teléfono",
    telefonoInvalido: "Ese teléfono es demasiado largo.",
    categoria: "Categoría de membresía",
    sinCategoria: "Sin categoría asignada",
    roles: "Roles",
    correoDeAcceso: "Correo de acceso",
    cambiarCorreo: "Cambiar mi correo de acceso",
    correoNuevo: "Correo nuevo",
    contrasenaActual: "Tu contraseña actual",
    contrasenaActualAyuda: "Se pide porque cambiar el correo es cambiar la llave de la cuenta.",
    enviarConfirmacion: "Enviar confirmación",
    pendiente: "Pendiente de confirmar:",
    pendienteAyuda:
      "Te enviamos un correo a esa dirección. Tu correo actual sigue funcionando hasta que la confirmes.",
  },

  confirmarCorreo: {
    titulo: "Confirmar tu correo nuevo",
    sinToken: "Este enlace está incompleto. Ábrelo desde el correo que te enviamos.",
    confirmando: "Confirmando…",
    listo: "Listo, tu correo de acceso quedó actualizado. Úsalo la próxima vez que ingreses.",
  },

  dispositivos: {
    titulo: "Mis dispositivos",
    descripcion: "Dónde está abierta tu sesión. Si ves algo que no reconoces, ciérralo.",
    esta: "Esta sesión",
    desde: "Abierta el",
    ultimaVez: "Última actividad",
    vence: "Vence el",
    recordada: "Sesión recordada en este dispositivo",
    cerrar: "Cerrar",
    cerrarTodas: "Cerrar todas las sesiones",
    // Cerrar todas incluye la de aquí: media desconexión no tranquiliza a quien cree que le
    // robaron la cuenta.
    cerrarTodasAyuda: "Incluye esta sesión: vas a tener que ingresar de nuevo.",
    sinOtras: "No tienes otras sesiones abiertas.",
  },

  avisos: {
    titulo: "Mis avisos",
    descripcion: "Elige qué correos quieres recibir del club.",
    inevitable: "No se puede desactivar",
    // Se muestran en gris con su motivo, no se esconden: esconderlos haría creer que el sistema
    // no los manda.
    inevitableAyuda: "Es un aviso de seguridad o el mecanismo mismo para entrar a tu cuenta.",
    tipos: {
      "identity.send-invitation": "Invitación para entrar a la plataforma",
      "identity.send-password-reset": "Enlace para restablecer tu contraseña",
      "identity.notify-password-changed": "Aviso de que tu contraseña cambió",
      "identity.notify-account-status-changed": "Aviso de que el estado de tu cuenta cambió",
    } as Record<string, string>,
  },

  dependientes: {
    titulo: "Perfiles a cargo",
    descripcion: "Los menores que administras en el club.",
    sinNinguno: "No tienes perfiles a cargo.",
    pagas: "Los cobros de este perfil llegan a tu estado de cuenta",
    noPagas: "Los cobros de este perfil los recibe el otro acudiente",
    waiverFirmado: "Exención firmada",
    waiverPendiente: "Falta firmar la exención",
    nacimiento: "Fecha de nacimiento",
  },

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
    calendario: "Calendario de canchas",
    canchas: "Canchas",
    handicaps: "Handicaps del club",
    practicas: "Prácticas",
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

  restablecer: {
    titulo: "Nueva contraseña",
    subtitulo: "Elige una contraseña nueva para tu cuenta.",
    sinToken:
      "Este enlace está incompleto. Ábrelo desde el correo, o pide uno nuevo desde «Olvidé mi contraseña».",
    contrasena: "Contraseña nueva",
    confirmacion: "Repite la contraseña",
    guardar: "Guardar contraseña",
    guardando: "Guardando…",
    // Se avisa que las demás sesiones se cerraron (R-010-09). Si no se dijera, quien tenía el
    // celular abierto pensaría que la plataforma se rompió cuando le pida entrar de nuevo.
    listo:
      "Listo, tu contraseña quedó cambiada. Por seguridad cerramos todas las sesiones abiertas, incluidas las de otros dispositivos: entra de nuevo con la contraseña nueva.",
    irAIngresar: "Ir a ingresar",
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

    // ── Canchas y calendario ─────────────────────────────────────────────────
    // El API además manda en `details` la franja que ocupa, para resaltarla en el calendario.
    cancha_ocupada: "Esa cancha ya está ocupada en ese horario.",
    nombre_de_cancha_en_uso: "Ya hay una cancha con ese nombre en el club.",
    cancha_no_disponible: "Esa cancha está fuera de servicio.",
    fuera_del_horario: "Ese horario está fuera de las horas de operación del club.",
    rango_invalido: "La hora de fin tiene que ser posterior a la de inicio.",

    // ── Handicaps ────────────────────────────────────────────────────────────
    handicap_fuera_de_rango: "El handicap va de −2 a 10 goles.",
    handicap_no_es_medio_gol: "El handicap se mueve en medios goles: 1,5 sí, 1,3 no.",
    // `details.actualHalves` trae el valor que ya rige, para poder nombrarlo.
    handicap_sin_cambio: "Ese jugador ya tiene ese handicap.",
    handicap_sin_motivo: "Escribe el motivo del cambio.",

    // ── Prácticas ────────────────────────────────────────────────────────────
    practica_rango_invalido: "La hora de fin tiene que ser posterior a la de inicio.",
    practica_minimo_mayor_que_objetivo:
      "El mínimo de jugadores no puede ser mayor que el objetivo: así la práctica nunca se confirmaría.",
    practica_cierre_despues_de_decision:
      "El cierre de postulaciones tiene que ser antes de la hora de decisión.",
    practica_decision_despues_de_empezar:
      "La hora de decisión tiene que ser antes de que empiece la práctica.",
    practica_no_editable: "Esta práctica ya no se puede editar.",
    practica_ya_publicada: "Esta práctica ya está publicada.",
    postulacion_cerrada: "Las postulaciones para esta práctica ya cerraron.",
    ya_estas_postulado: "Ya estás postulado a esta práctica.",
    no_estas_postulado: "No estás postulado a esta práctica.",
    supera_su_habilitacion: "Esta práctica es de un nivel superior al que te habilitaron.",
    practica_sin_nivel_declarado:
      "Esta práctica no declara su nivel, así que no se puede verificar que te corresponda.",
    pareja_no_valida: "Esa persona no te propuso compartir puesto.",

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
