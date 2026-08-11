# SPEC-020 — Club, organizaciones, temporadas y configuración

> Estado: ready · Depende de: 010 · Fuente: `docs/02` §A, `docs/08` completo, `docs/09` D-01,
> ADR-013, decisiones de Daniel del 2026-08-11 (§13)

Segundo módulo de la Fase 1 (`docs/roadmap.md`). Es la raíz sobre la que cuelga todo lo demás:
sin la entidad club no hay frontera de tenant, y sin configuración administrable cada regla del
polo termina siendo una constante que exige un despliegue para cambiarla.

## 1. Problema

Hoy el club existe sólo como un identificador suelto: `club_id` es una columna de texto sin nada
detrás. Eso tiene tres consecuencias concretas, y ninguna es teórica.

La primera es de seguridad. El aislamiento entre clubes es el requisito número uno del producto
(`docs/09` D-01), y el tenant se resuelve por subdominio (ADR-013) — pero **no hay contra qué
resolverlo**. El guard que debería rechazar un host desconocido no puede escribirse, y mientras
tanto nada impide que una fila apunte a un club que no existe.

La segunda es operativa. Todo lo que el club decide —a qué hora se cierra la lista de una
práctica, cuánto cuesta una categoría, cuántos días vale una invitación— vive hoy en documentos
(`docs/08`) y no en la plataforma. Si cambiarlos exige que un técnico despliegue, la plataforma le
devuelve al club exactamente la dependencia que vino a quitarle (P-04).

La tercera es comercial. Este producto se vende a otros clubes, y montar uno nuevo tiene que
costar horas, no días (`specs/140`). Nada de eso es posible mientras dar de alta un club consista
en insertar filas a mano.

## 2. Resultado esperado

Un club existe como entidad, con su nombre, su subdominio, su zona horaria y su moneda. Quien
entra por el subdominio de un club ve ese club y ningún otro; quien entra por un subdominio que no
corresponde a nada, no se entera de si existe o no. Dentro del club operan organizaciones —la
escuela, un equipo, un servicio— cada una con su gente y sus reglas propias. La actividad se
agrupa por temporadas con fechas reales. Y todo lo configurable de `docs/08` es un valor que el
administrador del club cambia desde la plataforma, con historia: se puede responder «cuánto
costaba esto en marzo» sin preguntarle a nadie.

## 3. Fuera de alcance (en esta versión)

- **Planes, límites y plantillas de aprovisionamiento**: son `specs/140`. Aquí un club se crea
  vacío y se configura; allá se crea desde una plantilla con catálogos precargados.
- **Marca del cliente** (logo, colores, correo con su remitente): `specs/140` HU-140-04.
- **Autoservicio de alta**: los clubes los damos de alta nosotros (`specs/140` §3).
- **Conmutador de club para personal que trabaja en varios**: `specs/140` HU-140-03. En esta
  versión, quien tiene cuenta opera en el club de su subdominio.
- **Los valores de configuración de módulos que todavía no existen.** El mecanismo se construye
  aquí y sirve para todos; cada catálogo concreto (prácticas, copas, clases) lo declara su propio
  módulo cuando llegue. Ver R-020-09.
- **Interfaz de administración de configuración pantalla por pantalla**: en esta versión se
  administra por API y una pantalla genérica de lista/edición. El diseño por dominio (una pantalla
  de «reglas de prácticas», otra de «tarifas») entra con cada módulo.

## 4. Actores

| Rol | Puede |
|---|---|
| Superadministrador (nosotros) | crear clubes, suspenderlos, reactivarlos; ver y cambiar configuración de ámbito plataforma |
| Administrador del club | configurar su club: datos, organizaciones, temporadas, categorías de membresía y valores de configuración de ámbito club |
| Administrador de organización | configurar **su** organización y los valores de ámbito organización; nunca los del club |
| Cualquier persona con cuenta | ver los datos públicos de su club (nombre, zona horaria, temporada vigente) — no la configuración |

## 5. Historias de usuario

### HU-020-01 — El club existe y se resuelve por su subdominio
**Como** plataforma **quiero** que cada solicitud sepa a qué club pertenece antes de tocar
cualquier dato **para** que el aislamiento no dependa de que alguien se acuerde de filtrar.

- **Dado** un club activo con subdominio `lospinos`, **cuando** alguien entra por
  `lospinos.<dominio>`, **entonces** todas sus solicitudes operan sobre ese club.
- **Dado** un subdominio que no corresponde a ningún club, **cuando** llega una solicitud,
  **entonces** el sistema responde «no encontrado» sin revelar si el club existe, está suspendido
  o nunca existió.
- **Dado** un club suspendido, **cuando** alguien entra por su subdominio, **entonces** responde
  igual que si no existiera — salvo para un superadministrador, que sí puede operarlo.
- **Dado** cualquier solicitud, **cuando** el cliente manda un identificador de club en el cuerpo,
  la ruta o una cabecera, **entonces** ese valor **no** determina el club (R-140-01).

### HU-020-02 — Dar de alta un club
**Como** superadministrador **quiero** crear un club nuevo **para** poner a funcionar a un cliente
sin tocar la base de datos a mano.

- **Dado** nombre, subdominio, zona horaria y moneda, **cuando** creo el club, **entonces** queda
  activo, con una temporada abierta y sus categorías de membresía por defecto.
- **Dado** un subdominio ya usado, **cuando** intento crearlo, **entonces** el sistema lo impide.
- **Dado** un subdominio con mayúsculas, espacios o caracteres que no valen en un nombre de host,
  **cuando** intento crearlo, **entonces** el sistema lo impide y dice por qué.
- **Dado** un club recién creado, **cuando** designo a su primer administrador, **entonces** esa
  persona recibe su invitación y entra por el subdominio del club.

### HU-020-03 — El primer club de una instalación
**Como** operador de la plataforma **quiero** poder crear el primer club y su primer administrador
**para** salir del problema del huevo y la gallina: no hay superadministrador con quien
autenticarse en una instalación nueva.

- **Dado** una base de datos sin ningún club, **cuando** ejecuto el arranque desde el servidor,
  **entonces** quedan creados el club, su primer administrador y su superadministrador.
- **Dado** una base de datos que ya tiene clubes, **cuando** ejecuto el arranque de nuevo,
  **entonces** no duplica nada y avisa que ya estaba hecho.
- **Dado** cualquier momento, **cuando** alguien busca esta funcionalidad por HTTP, **entonces**
  no existe: no hay ruta, ni pública ni protegida, que la exponga.

### HU-020-04 — Suspender y reactivar un club
**Como** superadministrador **quiero** suspender un club **para** cortar el acceso cuando termina
un contrato, sin borrar nada.

- **Dado** un club activo, **cuando** lo suspendo, **entonces** sus usuarios dejan de entrar de
  inmediato y sus datos quedan intactos.
- **Dado** un club suspendido, **cuando** lo reactivo, **entonces** todo vuelve a funcionar tal
  como estaba, incluidas las sesiones que caducaron por su cuenta.
- **Dado** un club suspendido, **cuando** consulto la plataforma como superadministrador,
  **entonces** lo veo y sé desde cuándo y por qué.

### HU-020-05 — Organizaciones dentro del club
**Como** administrador del club **quiero** registrar las organizaciones que operan adentro
**para** que cada una tenga su gente, sus reglas y sus cobros sin mezclarse con las demás.

- **Dado** el club, **cuando** creo una organización con su nombre y tipo (escuela, equipo,
  servicio), **entonces** puedo asignarle administradores, instructores y petiseros.
- **Dado** una organización, **cuando** deja de operar, **entonces** se archiva conservando su
  historia; nunca se borra.
- **Dado** un administrador de organización, **cuando** intenta ver o cambiar otra organización o
  el club entero, **entonces** el sistema lo impide (R-010-04).

### HU-020-06 — Temporadas
**Como** club **quiero** agrupar la actividad por temporadas con fechas reales **para** poder
responder «cómo nos fue en la temporada pasada» y para que los handicaps y las estadísticas tengan
un período al cual pertenecer.

- **Dado** una temporada con fecha de inicio y fin, **cuando** la abro, **entonces** las
  prácticas, copas y estadísticas nuevas se agrupan en ella.
- **Dado** dos temporadas del mismo club, **cuando** sus fechas se solapan, **entonces** el
  sistema lo impide: en un momento dado hay una sola temporada vigente.
- **Dado** una temporada, **cuando** la cierro, **entonces** su historia queda consultable y no se
  puede seguir registrando actividad nueva en ella.
- **Dado** un club recién creado, **cuando** todavía nadie definió temporadas, **entonces** existe
  una abierta por defecto para que nada quede sin agrupar.

### HU-020-07 — Categorías de membresía
**Como** administrador del club **quiero** definir las categorías de membresía y sus derechos
**para** que las tarifas y los permisos de participación no sean una lista fija del sistema.

- **Dado** el catálogo, **cuando** creo una categoría con su nombre, su cuota mensual y sus
  derechos, **entonces** queda disponible para asignarla a personas.
- **Dado** una categoría en uso, **cuando** cambio su cuota, **entonces** los cobros ya emitidos
  no cambian, y los nuevos usan el valor nuevo.
- **Dado** una categoría en uso, **cuando** intento eliminarla, **entonces** el sistema no lo
  permite: se desactiva, y quienes la tienen la conservan.

### HU-020-08 — Configuración con historia
**Como** administrador del club **quiero** cambiar los valores que rigen la operación **para** no
depender de un técnico cada vez que el club decide algo distinto.

- **Dado** un valor de configuración, **cuando** lo cambio, **entonces** rige desde el momento que
  yo indique, y el valor anterior queda consultable con su período de vigencia.
- **Dado** una consulta sobre una fecha pasada, **cuando** pregunto qué valor regía entonces,
  **entonces** obtengo el que regía entonces, no el de hoy.
- **Dado** un valor que el club nunca tocó, **cuando** se consulta, **entonces** rige el valor por
  defecto de la plataforma, y se distingue de un valor que el club fijó explícitamente.
- **Dado** un valor de ámbito organización, **cuando** lo consulto para una organización que no lo
  fijó, **entonces** hereda el del club, y si el club tampoco lo fijó, el de la plataforma.
- **Dado** cualquier cambio de configuración, **cuando** ocurre, **entonces** queda en la
  auditoría con quién, cuándo y qué valor tenía antes.

### HU-020-09 — Datos públicos del club
**Como** persona del club **quiero** ver el nombre y los datos básicos de mi club desde la
pantalla de ingreso **para** saber que estoy en el lugar correcto antes de escribir mi contraseña.

- **Dado** un subdominio de club activo, **cuando** abro la aplicación sin haber iniciado sesión,
  **entonces** veo el nombre del club.
- **Dado** esa misma pantalla, **cuando** la inspecciono, **entonces** no revela cuántas personas
  tiene el club, ni sus organizaciones, ni ningún dato que no sea el nombre y la marca.

## 6. Reglas de negocio

- `R-020-01` El tenant se resuelve **por el host de la solicitud** y por ninguna otra vía. Un
  identificador de club recibido del cliente nunca lo determina (P-05, R-140-01).
- `R-020-02` Un host que no corresponde a un club **activo** responde «no encontrado». Nunca se
  distingue «no existe» de «suspendido» (P-12): la diferencia le diría a un competidor que
  cierto club es cliente nuestro.
- `R-020-03` El subdominio es único en toda la plataforma, se guarda en minúsculas y sólo admite
  letras, números y guiones. Cambiarlo es una operación explícita de superadministrador, no una
  edición de perfil: rompe enlaces y sesiones.
- `R-020-04` Suspender un club corta el acceso de sus usuarios **de inmediato**, igual que
  suspender una cuenta (R-010-09). No se borra nada.
- `R-020-05` Toda organización pertenece a exactamente un club. Una organización que opera en dos
  clubes son dos organizaciones distintas, con su propia gente y sus propias tarifas (§13, D-020-01).
- `R-020-06` Dos temporadas del mismo club no pueden solaparse en el tiempo. En un instante dado
  hay como máximo una temporada vigente.
- `R-020-07` Nada de esto se borra: club, organización, temporada y categoría se archivan o se
  cierran (P-06). El único borrado real es el del flujo de datos personales (Ley 1581).
- `R-020-08` Un valor de configuración **nunca se actualiza en sitio**: cambiarlo inserta una fila
  nueva con su fecha de vigencia. El valor vigente es el de mayor vigencia menor o igual al
  instante consultado (`docs/02` §A).
- `R-020-09` Sólo se puede fijar un valor que esté **registrado en el catálogo** de configuración,
  con su ámbito y su tipo. Una clave inventada se rechaza: una configuración que acepta cualquier
  cosa es una configuración que nadie sabe leer.
- `R-020-10` La resolución de un valor va de lo específico a lo general: organización → club →
  plataforma → valor por defecto del catálogo. Se distingue siempre si el valor vino de un ajuste
  explícito o del default heredado.
- `R-020-11` La configuración de ámbito plataforma sólo la cambia un superadministrador; la de
  club, un administrador del club; la de organización, su administrador de organización o
  superior (`docs/06` §4).
- `R-020-12` Toda creación, suspensión, reactivación y cambio de configuración queda en
  `audit_log` (P-07, R-010-11).
- `R-020-13` La zona horaria del club es la que define qué día es «hoy» para toda regla con
  fechas de calendario. No se asume `America/Bogota` en ningún punto del código.
- `R-020-14` La moneda del club es informativa en esta versión: todo importe se persiste en
  centavos enteros (P-02) y el club opera en una sola moneda. Multi-moneda no está en alcance.

## 7. Datos

`club`, `organization`, `season`, `setting`, `setting_definition`, y la relación de las tablas ya
existentes de 010 con `club` (`docs/02` §A). Esta versión **agrega las llaves foráneas que 010
dejó pendientes**: `person.club_id`, `person_organization.club_id` y `.organization_id`,
`commissioner_delegation.club_id`, hoy texto libre sin integridad referencial — está anotado como
entregable de este módulo en el propio `schema.prisma`.

## 8. Interfaz

Rutas de plataforma (superadministrador) para el alta y la suspensión de clubes; rutas de club
para organizaciones, temporadas, categorías y configuración; y una ruta pública, servida en el
subdominio, con los datos mínimos de la pantalla de ingreso. El detalle va en `plan.md`.

## 9. Dominio puro

Tres reglas que no dependen de la base de datos y por lo tanto viven en `packages/domain`:
resolver el club a partir del host, validar que un subdominio sea usable, y resolver qué valor de
configuración rige en un instante dado con su cadena de herencia. La primera ya está especificada
en `specs/140` §9 y se implementa aquí.

## 10. Pantallas

Configuración del club (datos básicos, zona horaria), organizaciones, temporadas, categorías de
membresía, y una pantalla genérica de configuración por ámbito con su historial de cambios.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El subdominio se resuelve mal detrás del proxy inverso y todos los clubes ven el mismo tenant | el host se lee de un encabezado explícitamente configurado en el despliegue (`docs/07`), y hay test de integración con dos clubes simultáneos |
| Una configuración mal tipada rompe un módulo en producción al leerla | el catálogo declara tipo y valor por defecto de cada clave, y el valor se valida contra ese tipo **al escribirlo**, no al leerlo |
| El histórico de configuración crece sin control | son cambios manuales de un administrador, no tráfico; se acota con índice por clave y ámbito, y se revisa cuando haya volumen real |
| Cerrar una temporada con actividad en curso deja prácticas huérfanas | cerrar exige que no queden prácticas ni copas abiertas en ella; el sistema lo comprueba y lo dice |
| El arranque del primer club se ejecuta por error en una base que ya tiene datos | es idempotente y se niega a correr si ya hay clubes |

## 12. Definición de terminado

- [ ] Un host desconocido responde «no encontrado» sin tocar la base de datos de usuarios
- [ ] Dos clubes simultáneos, probados en el mismo test, no se ven entre sí por ninguna ruta
- [ ] `T-020` de `specs/010` queda desbloqueada e implementada
- [ ] Las llaves foráneas pendientes de 010 quedan puestas, con su migración reversible
- [ ] Un valor de configuración cambiado conserva el anterior y se puede consultar por fecha
- [ ] La herencia organización → club → plataforma → default está probada en los cuatro niveles
- [ ] El arranque del primer club corre dos veces sin duplicar nada
- [ ] Cada cambio de configuración deja exactamente una fila de auditoría
- [ ] Demostrado en staging: crear un club nuevo y dejarlo operativo en menos de una hora

## 13. Decisiones tomadas (2026-08-11)

Preguntadas antes de escribir este documento, porque cada respuesta cambiaba el modelo:

- **D-020-01 — Una organización pertenece a un club.** Cuatro Soles opera dentro de Los Pinos y
  tiene su `club_id`. Si mañana opera en otro club, allá es **otra** organización, con su propia
  gente y sus propias tarifas. Se descartó modelarla como entidad que cruza clubes: habría abierto
  un camino de datos entre inquilinos, que es justo lo que P-05 existe para impedir, y a cambio de
  una comodidad que hoy nadie necesita.
- **D-020-02 — Alcance del módulo.** Club y configuración, con alta mínima de clubes. Planes,
  plantillas, marca blanca y conmutador multi-club quedan en `specs/140`, como manda el roadmap.
- **D-020-03 — El club opera por temporadas con fechas reales.** No es una temporada permanente
  ficticia: hay inicio y fin, y la actividad se agrupa en ellas.
- **D-020-04 — El primer club nace de un script ejecutado en el servidor**, no de un endpoint. Un
  alta de clubes expuesta por HTTP necesitaría un superadministrador que en una instalación nueva
  todavía no existe, y cualquier atajo para ese caso (una clave de arranque, una ruta abierta
  «sólo la primera vez») es exactamente el tipo de puerta que después nadie recuerda cerrar.

## 14. Supuestos

Tomados por falta de dato, marcados para revisar con el club:

- `[SUPUESTO]` El club opera en **una sola moneda** (COP). Nada en el PRD sugiere lo contrario y
  multi-moneda cambiaría el modelo de dinero entero; si aparece un club fuera de Colombia, es una
  decisión nueva, no un ajuste.
- `[SUPUESTO]` Las temporadas **no se solapan**. Es lo que hace que «la temporada vigente» sea una
  respuesta y no una lista. Si el club llegara a correr dos calendarios en paralelo (por ejemplo
  escuela y alta competencia), habría que revisarlo.
- `[SUPUESTO]` Un club tiene **un solo subdominio**. Los alias (un dominio viejo que debe seguir
  funcionando) no están contemplados; entran con la marca blanca de `specs/140`.
- `[SUPUESTO]` Los nombres de las categorías de membresía por defecto son los de `docs/02` §A
  (estudiante, miembro temporal, miembro permanente, socio, invitado). El club puede cambiarlos:
  son un catálogo, no un enum.
