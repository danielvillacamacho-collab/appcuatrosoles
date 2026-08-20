# TASKS-010 — Identidad, acceso y roles

> Cada tarea: una sesión, un commit (`docs/10-operating-manual-solo.md` §2). Formato de
> arranque de sesión sugerido:
> `Lee CLAUDE.md, memory/constitution.md y specs/010-identidad-acceso-roles/tasks.md.
> Implementa la tarea T-0XX. No toques nada fuera de su alcance. Al terminar: corre pnpm
> lint, typecheck y test, y muéstrame el diff completo.`

Si una tarea, al hacerla, resulta tocar más de 5 archivos o 400 líneas de diff: detente y
avisa — la tarea estaba mal partida (`docs/10` §2).

## A — Esquema y migraciones

- [x] **T-001** Agregar a `prisma/schema.prisma` los modelos `Person`, `UserAccount`,
  `Session` (`plan.md` §1). Generar migración. Verificación: `pnpm db:migrate:dev` corre
  limpio; migración revierte con `down`. ✅ 2026-08-10 — ver `verification.md` §T-001.
- [x] **T-002** Agregar `PersonOrganization`, `RoleAssignment`, `CommissionerDelegation`.
  Verificación: migración `up`/`down` en CI contra Postgres real. ✅ 2026-08-10 — ver
  `verification.md` §T-002.
- [x] **T-003** Agregar `Guardianship`, `MembershipCategory`, `MembershipAssignment`.
  Verificación: igual que T-002. ✅ 2026-08-10 — ver `verification.md` §T-003.
- [x] **T-004** Agregar `WaiverVersion`, `WaiverAcceptance`, `AuditLog` + hacer `audit_log`
  append-only. Verificación: `UPDATE`, `DELETE` y `TRUNCATE` contra `audit_log` fallan.
  ✅ 2026-08-10 — ver `verification.md` §T-004.
  > **La tarea se partió al ejecutarla.** Decía «`REVOKE UPDATE, DELETE` … para el rol de
  > aplicación», pero hoy la aplicación se conecta con un rol que es **superusuario y dueño de
  > la tabla**, y en PostgreSQL ambos saltan toda comprobación de permisos: ese `REVOKE` no
  > habría hecho nada y habría dejado una falsa sensación de garantía. Se implementó con
  > **triggers**, que sí aplican a todo el mundo. El `REVOKE` sigue siendo deseable como
  > segunda capa y va en **T-007**, porque crear el rol toca `docker-compose`, `.env`, el
  > despliegue y el CI.
- [ ] **T-007** Rol de base de datos de menor privilegio para la aplicación (segunda capa de
  P-07). Crear un rol **no superusuario** con el que se conecte `apps/api`, dejar la propiedad
  del esquema y las migraciones al rol administrador, y aplicar
  `REVOKE UPDATE, DELETE ON audit_log` + `GRANT SELECT, INSERT`. Toca `docker-compose.yml`,
  `.env.example`, `docs/07-deployment-ec2.md` y el workflow de CI. Verificación: conectado como
  el rol de aplicación, `UPDATE audit_log` falla **por permisos** (no sólo por el trigger), y
  las migraciones siguen corriendo con el rol administrador.
- [x] **T-005** ~~Constraint parcial `UNIQUE(club_id, email) WHERE email IS NOT NULL` en SQL
  crudo~~ → **corregido en T-001**: no hace falta SQL crudo. PostgreSQL trata los `NULL` como
  distintos en un índice único, así que el `@@unique([clubId, email])` normal de Prisma ya da
  exactamente el comportamiento pedido. Test automatizado escrito.
  ✅ 2026-08-10 — ver `verification.md` §T-005.
  > Esta tarea arrastró el **andamiaje de tests de integración** (Testcontainers + Postgres real,
  > `pnpm test:int`), porque era el primero del proyecto. Y al montarlo salió un bug latente de
  > la Fase 0: `apps/api` compilaba a CommonJS declarando `"type": "module"`, así que
  > `node dist/main.js` se caía al arrancar — el build pasaba y la API nunca había corrido.
- [x] **T-006** Seed mínimo (`pnpm db:seed`): un club, tres personas con roles distintos
  (`club_admin`, `commissioner`, `player`), una categoría de membresía. Verificación: correr
  el seed dos veces no duplica nada (idempotente). ✅ 2026-08-10 — ver `verification.md` §T-006.
  > La idempotencia quedó **automatizada** (`test/integration/seed.int-spec.ts`), no verificada a
  > mano: el seed expone `sembrarClubDemo(prisma)` para que un test pueda llamarla dos veces.

## B — Dominio puro (`packages/domain/identity`)

- [x] **T-010** `accountStatusAllowsLogin(status)`. Tests: los 4 estados, nombre de test en
  español citando HU-010-04. ✅ 2026-08-10 — ver `verification.md` §T-010.
  > Se agregó además `resolveLoginOutcome`, que encierra el orden «contraseña primero, estado
  > después» (R-010-07): con un booleano suelto, el controlador tendría que reimplementar ese
  > orden y una fuga de enumeración de cuentas quedaría a un despiste de distancia. Y de paso se
  > descubrió que **la barrera de arquitectura que protege el dominio no detectaba nada** — ver
  > verification.md.
- [x] **T-011** `canAssignRole(actor, targetRole, targetScope)`. Tests: cubre R-010-04 exacto
  (admin de organización intentando rol de club → rechazado; club_admin asignando rol de
  organización ajena → rechazado). ✅ 2026-08-10 — 27 tests, ver `verification.md` §T-011.
  > Resolvió una ambigüedad con consecuencia de seguridad: si `organization_admin` puede nombrar a
  > otro como él. `docs/06` decía que no, el spec leído literalmente decía que sí. Se resolvió por
  > menor privilegio y quedó escrito en ambos documentos.
- [x] **T-012** `isInvitationLinkValid(invitation, now)`, con `Clock` inyectado. Tests: recién
  creado, a las 6 días 23h, a los 7 días exactos, ya usado. ✅ 2026-08-10 — 10 tests, ver
  `verification.md` §T-012.
  > La ventana de validez **no** quedó como constante del dominio: entra como parámetro
  > (`auth.invitation_link_validity_days`, `docs/08` §9), porque los 7 días son configuración
  > (P-04). Y el orden de las dos comprobaciones resultó tener consecuencia operativa: se mira
  > primero el uso y después el vencimiento.
- [x] **T-013** `isWaiverAcceptanceCurrent(acceptance, currentVersion)`. Tests: sin
  aceptación, aceptación de versión anterior, aceptación vigente. ✅ 2026-08-10 — 5 tests, ver
  `verification.md` §T-013.
  > Compara por **identificador** de versión, no por número: el correlativo `version` es por club,
  > así que comparar números habría dado por cubierta en un club a quien firmó en otro (P-05).
- [x] **T-014** `resolvePrimaryPayer(guardianships, now)`. Tests: cero payers vigentes, uno,
  dos solapados (debe fallar como dato inconsistente, no elegir uno arbitrariamente).
  ✅ 2026-08-10 — 13 tests, ver `verification.md` §T-014.
  > No recibe `now: Date` sino `today: LocalDate`, un tipo nuevo en `shared/`: las columnas
  > `starts_on`/`ends_on` son `date` sin hora, y compararlas contra un instante daba por vencido
  > un vínculo el día que aún regía (5 horas de desfase con Bogotá). Ver el análisis en
  > `verification.md`. **La tarea trajo `shared/localDate.ts` con su test**, que no estaba en el
  > plan.

## C — Infraestructura transversal (guards, decoradores, interceptor)

- [x] **T-020** `TenantGuard`: resuelve club por subdominio del host, `404` si no coincide con
  ningún club activo, antes de tocar cualquier otro guard. Verificación: test con host
  desconocido → `404` sin llegar a consultar usuario.
  ✅ 2026-08-11 — **implementada en `specs/020` como T-221**, 13 tests de integración.
  > Estuvo bloqueada desde el 2026-08-10: «ningún club activo» exigía la tabla `club`, que crea el
  > módulo 020. Se escribió `specs/020` entero (spec, plan, tareas) y el guard salió de ahí. La
  > consecuencia práctica: `req.tenant` deja de ser un contrato que sólo llenan middlewares de
  > test, y `PermissionGuard` y `AuditInterceptor` ya tienen quién se lo llene de verdad.
- [x] **T-021** `SessionGuard`: valida cookie de sesión, adjunta `CurrentUser` al request.
  Verificación: sin cookie → `401`; cookie de sesión revocada → `401`. ✅ 2026-08-10 — 10 tests de
  integración, ver `verification.md` §T-021.
  > **Se partió en tres commits**, como manda `docs/10` §2 cuando una tarea desborda: (1) el
  > andamiaje de NestJS que no existía —`PrismaModule` y `ClockModule`—, (2) dos fallos del
  > andamiaje que la tarea destapó (Vitest sin metadata de decoradores, y los paquetes del
  > workspace apuntando a `src/*.ts` en vez de a `dist`), y (3) el guard. Los siete rechazos
  > posibles responden un `401` idéntico byte a byte.
- [x] **T-022** `@RequirePermission()` + `PermissionGuard`: falla el arranque de la app si una
  ruta mutante no declara el decorador (`ADR-014` punto 4). Verificación: test que registra
  una ruta sin decorador y confirma que la app no arranca. ✅ 2026-08-10
  > **Se partió en dos**, porque la evaluación de permisos es una regla de negocio y no plomería de
  > NestJS: **(a)** `hasPermission` y la matriz de `docs/06` §4 en `packages/domain` — 21 tests,
  > ver `verification.md` §T-022a; **(b)** el decorador, el guard y la comprobación de arranque —
  > 16 tests, ver `verification.md` §T-022b.
- [x] **T-023** `AuditInterceptor` + `@Auditable()`: registra automáticamente antes/después en
  mutaciones marcadas. Verificación: una mutación de prueba genera exactamente una fila en
  `audit_log`. ✅ 2026-08-10 — 8 tests de integración, ver `verification.md` §T-023.
  > El «antes» **no se puede inferir**: leerlo de forma genérica exigiría que el interceptor supiera
  > qué tabla consultar para cada acción. Lo aporta el servicio con `anotarEstadoPrevio`, y todo lo
  > demás —quién, cuándo, en qué club, con qué `requestId`, sobre qué entidad— sí es automático.
  > Con esto **cierra la sección C salvo T-020**, que sigue bloqueada.
- [x] **T-024** Filtro global de excepciones → formato de error único de `docs/03` §2, con
  `requestId` (Pino) en cada respuesta de error. ✅ 2026-08-10 — 12 tests, ver
  `verification.md` §T-024.
  > Se adelantó al resto de la sección C porque **T-020 quedó bloqueada** (ver su nota) y porque
  > los tres guards que siguen responden errores: sin este filtro, cada uno inventaría su formato.
  > El montaje quedó en `src/configure-app.ts`, compartido por `main.ts` y los tests, para que no
  > se repita lo de T-005 (probar algo distinto de lo que corre en producción).

- [x] **T-025** Protección CSRF por doble envío de token en toda mutación (`docs/06` §1).
  > **Tarea agregada el 2026-08-10, al cerrar T-021.** No estaba en el plan y el requisito sí:
  > `docs/06` §1 la exige para toda mutación. Hoy no hay agujero abierto porque el API todavía no
  > tiene ninguna, pero **la primera es T-030 (login)**, así que esta tarea va antes de la sección
  > D. Con `SameSite=Lax` el riesgo baja pero no desaparece: `Lax` no protege entre **subdominios
  > del mismo sitio**, y nuestra topología es justamente un subdominio por club (P-05, ADR-013).
  > Verificación: una mutación sin el encabezado del token responde `403`; con el token correcto
  > pasa; y el token de CSRF no viaja en una cookie que pueda leer otro subdominio.

- [x] **T-026** Bandeja de salida transaccional (P-11) + puerto `Mailer` con adaptador **local**.
  > **Tarea agregada el 2026-08-11.** `plan.md` §5 lista cinco jobs y ADR-012 elige `pg-boss`, pero
  > ninguna tarea montaba la cola — y sin ella, T-035, T-036, T-050 y T-090 no se pueden terminar:
  > todas encolan un correo *en la misma transacción* que el cambio de datos. Sin eso, un fallo
  > después del `COMMIT` deja una invitación que nunca llega, o un correo enviado por un cambio que
  > se revirtió.
  >
  > **El adaptador de correo es local a propósito**: escribe cada mensaje a disco para poder abrirlo
  > en el navegador. `SesMailer` (ADR-008) entra cuando se configure la cuenta de AWS; hasta
  > entonces el producto se prueba de punta a punta sin depender de nada externo. Verificación: un
  > cambio que falla no deja mensaje encolado; un mensaje encolado se envía una sola vez.
  > ✅ 2026-08-11 — 7 tests, ver `verification.md` §T-026.

## D — Autenticación (`auth/`)

- [x] **T-030** `POST /auth/login`: camino feliz (HU-010-04, cuenta activa). Test de contrato
  + test de camino feliz. ✅ 2026-08-11 — 20 tests, ver `verification.md` §T-030.
  > **Encontró un agujero de aislamiento**: sin comprobarlo, cualquiera con cuenta en un club podía
  > iniciar sesión por el subdominio de otro y leer su estructura por las rutas que sólo exigen
  > sesión. Ahora una cuenta sólo entra donde pertenece. Se decidieron y documentaron además la
  > duración de la sesión (12 h / 30 días con «recordarme») y los parámetros de Argon2id.
- [x] **T-031** `POST /auth/login`: mensaje de error genérico ante credencial incorrecta y
  ante correo inexistente — mismo mensaje en ambos casos (R-010-07). Test que compara los dos
  cuerpos de respuesta byte a byte. ✅ 2026-08-11 — ver `verification.md` §T-031.
  > El mensaje genérico del catálogo («Debes iniciar sesión para continuar») era correcto para una
  > ruta que exige sesión y desconcertante para quien acaba de escribir su contraseña. Ahora el
  > login tiene el suyo, y se comparan **cuatro** formas de fallar, no dos: cuerpo, estado y
  > cabeceras.
- [x] **T-032** Bloqueo tras 5 intentos fallidos (`docs/08` `auth.failed_login_lockout_*`).
  Test con `FixedClock`: al quinto intento bloquea; pasado el tiempo, desbloquea. ✅ 2026-08-11 —
  6 tests, ver `verification.md` §T-032.
  > **Primer consumidor real del catálogo de configuración** (T-212 de `specs/020`): el umbral y
  > los minutos salen de `setting`, no de constantes, y hay un test que baja el umbral a 2 y
  > comprueba que el comportamiento cambia sin desplegar nada. Con esto P-04 deja de cumplirse
  > sólo en el diseño.
- [x] **T-033** Rechazo de login por estado `invited`/`suspended`/`archived` con mensaje
  específico por estado (no el genérico de credenciales). ✅ 2026-08-11 — 3 tests, ver
  `verification.md` §T-033.
  > El motivo **sólo llega a quien acertó la contraseña**: con la contraseña equivocada, una cuenta
  > suspendida responde exactamente lo mismo que un correo inexistente. Es lo que hace compatibles
  > el PRD («un mensaje acorde al estado») y P-12, y lo hace posible el orden que `resolveLoginOutcome`
  > fijó en T-010.
- [x] **T-034** `POST /auth/logout` y `POST /auth/logout-all`. Test: sesión cerrada no sirve
  ni con "atrás" del navegador (repetir la misma request con la cookie vieja → `401`).
  ✅ 2026-08-11 — 9 tests, ver `verification.md` §T-034.
  > El decorador `@RutaPublica` pasó a llamarse **`@SinPermiso`**: ahora cubre dos familias
  > distintas —rutas públicas (login) y rutas autenticadas sin nada que autorizar (cerrar la
  > sesión propia)— y el nombre viejo describía sólo la primera.
- [x] **T-035** `POST /auth/password/forgot`: mismo mensaje exista o no la cuenta (R-010-07);
  encola `identity.send-password-reset` en la misma transacción (P-11). ✅ 2026-08-11 —
  ver `verification.md` §T-035/036.
- [x] **T-036** `POST /auth/password/reset`: token de un solo uso, expira en 1h, revoca las
  demás sesiones al usarse (R-010-09). Tests: token usado dos veces, token expirado.
  ✅ 2026-08-11 — 12 tests entre las dos, ver `verification.md` §T-035/036. **Cierra la sección D.**
  > Revoca **todas** las sesiones, no «las demás»: si alguien entró con credenciales robadas,
  > dejarle una viva convierte el gesto en nada.
- [x] **T-037** `POST /me/password` (cambio estando dentro): valida contraseña actual, exige
  las dos nuevas contraseñas coincidentes, rechaza si la actual es incorrecta. ✅ 2026-08-11 —
  12 tests, ver `verification.md` §T-037.
  > **Cierra las demás sesiones** y conserva la actual. No estaba pedido: quien cambia su
  > contraseña suele hacerlo porque sospecha de alguien, y dejar vivas las otras convierte el gesto
  > en un trámite.
- [x] **T-038** Política de complejidad de contraseña (mínimo 8, letras+números, rechaza lista
  de comunes) + Argon2id con parámetros documentados (`plan.md` §7 riesgo de configuración).
  ✅ 2026-08-11 — 24 tests de dominio, ver `verification.md` §T-038. Los parámetros de Argon2id
  se fijaron en T-030.
  > Una regla que el documento no pedía: **la contraseña no puede contener el correo**. Y dos que
  > el documento no pide y que se decidieron **no** agregar: símbolos y mayúsculas obligatorios.

## E — Perfil propio (`me/`)

- [x] **T-040** `GET /me`: devuelve datos propios, roles, categoría, organizaciones — sin
  exponer campos administrativos que el propio usuario no debe editar. ✅ 2026-08-11 — ver
  `verification.md` §E.
- [x] **T-041** `PATCH /me`: sólo permite editar teléfono, foto, preferencias de notificación.
  Test: un intento de mandar `categoryId` o `roles` en el body no tiene efecto (se ignora, no
  se rechaza con error — para no filtrar la existencia del campo a quien no debería tocarlo).
  ✅ 2026-08-11 — ver `verification.md` §E.
  > **Las preferencias de notificación quedan fuera**: su tabla es T-091 y todavía no existe.
  > Hoy se editan teléfono y foto.
- [x] **T-042** `POST /me/email-change` + `POST /me/email-change/confirm`: correo anterior
  sigue válido hasta confirmar el nuevo. ✅ 2026-08-11 — ver `verification.md` §E.
- [x] **T-043** `GET /me/sessions` y `DELETE /me/sessions/:id`. ✅ 2026-08-11 — 13 tests entre
  las cuatro tareas, ver `verification.md` §E. **Cierra la sección E.**

## F — Gestión de usuarios (`users/`)

- [x] **T-050** `POST /users`: creación por administrador, estado inicial `invited`, encola
  `identity.send-invitation` en la misma transacción. Test de contrato + HU-010-01 camino
  feliz.
- [x] **T-051** `POST /users` — rechazo por correo duplicado (HU-010-01, segundo criterio).
- [x] **T-052** `POST /users` — administrador de organización sólo puede asignar roles dentro
  de su organización al crear (usa `canAssignRole` de T-011).
- [x] **T-053** `POST /users/:id/invite` (reenvío) — nueva invitación, el enlace anterior deja
  de ser válido.
- [x] **T-054** `GET /users` con filtros (`status`, `role`, `organizationId`, `categoryId`,
  `q`) + aislamiento: administrador de organización nunca ve usuarios de otra (HU-010-08,
  segundo criterio) — test de aislamiento explícito.
- [x] **T-055** `GET /users/:id` y `PATCH /users/:id`. Test de aislamiento igual que T-054
  sobre acceso directo por id (`404`, no `403`, si es de otro ámbito administrable — ver
  `docs/03` §3 tabla de códigos).
- [x] **T-056** `POST /users/:id/suspend` y `/reactivate`: suspender revoca todas las sesiones
  activas de inmediato (test explícito, no basta con cambiar el estado en base de datos).
- [x] **T-057** `POST /users/:id/archive` y `/restore`.
- [x] **T-058** Auto-protección: `suspend`/`archive`/retirar rol sobre el propio actor →
  rechazado (R-010-05) sin importar que sea `superadmin`.
- [x] **T-059** `GET /users/export`: mismo filtro que el listado, formato Excel/CSV.
  ✅ 2026-08-11 — 19 tests para toda la sección F, ver `verification.md` §F. **Cierra la sección F.**
  > Tres cosas que la sección destapó: el guard no dejaba trabajar a un administrador de
  > organización (se agregó ámbito **opcional** y **amplio** al decorador), crear a alguien con rol
  > de organización no lo **vinculaba** a ella, y cambiar de categoría el mismo día choca con la
  > restricción de la base — y hace bien.

## G — Roles (`roles/`)

- [x] **T-060** `POST /users/:id/roles`: usa `canAssignRole`; registra en `audit_log` con
  quién/a quién/qué rol/cuándo (R-010-11).
- [x] **T-061** `DELETE /users/:id/roles/:roleAssignmentId`: retiro de rol, efecto inmediato
  (test: una request inmediatamente posterior con ese rol ya no pasa el `PermissionGuard`).
- [x] **T-062** Test de integración específico de R-010-04: administrador de organización
  intentando `role.assign` con `scope=club` → `403`. ✅ 2026-08-11 — 6 tests, ver
  `verification.md` §G. **Cierra la sección G.**
  > El contrato tuvo que cambiar: un `scopeId` que a veces era un club y a veces una organización
  > hacía imposible que el guard resolviera el ámbito **antes** de entrar al controlador.

## H — Familias, membresía y waivers

- [x] **T-070** `POST /guardianships`: crea vínculo, cierra automáticamente el `endsOn` de un
  payer anterior si el nuevo se marca `isPrimaryPayer=true` (mantiene el invariante "exactamente
  uno vigente", `plan.md` §7).
- [x] **T-071** Job `identity.check-primary-payer-integrity` (cron diario): detecta
  dependientes activos sin payer vigente, notifica al administrador. Test: fixture con el caso
  roto, confirma que el job lo detecta.
- [x] **T-072** `MembershipAssignment`: alta y consulta de categoría vigente por persona
  (histórico, nunca se sobreescribe — sólo se agrega fila nueva).
- [x] **T-073** `POST /waivers` (`club_admin`): publica nueva versión.
- [x] **T-074** `POST /waivers/current/accept`: acepta en nombre propio o, si la persona es
  menor, registrado por el acudiente (`acceptedByPersonId`).
- [x] **T-075** Guard/helper reutilizable `assertWaiverAccepted(personId)` para que otros
  módulos (prácticas, clases) lo llamen sin reimplementar la regla (R-010-12). ✅ 2026-08-11 —
  11 tests para toda la sección H, ver `verification.md` §H. **Cierra la sección H.**
  > Se llama `WaiversService.exigirWaiverVigente` y su módulo es **global**, para que ningún módulo
  > futuro tenga que importarlo — y para que nadie, por no hacerlo, escriba la comprobación por su
  > cuenta.
  > **T-072 quedó cubierta por la sección F**: el cambio de categoría con historia se implementó al
  > editar usuarios, con su regla del mismo día.

## I — Auditoría

- [x] **T-080** `GET /audit-log` con filtros y aislamiento por ámbito del solicitante
  (`organization_admin` sólo ve auditoría de su organización).
- [x] **T-081** Test transversal: cada acción de la lista de R-010-11 (crear, suspender,
  archivar, asignar/retirar rol) deja **exactamente una** fila de auditoría, ni cero ni dos.
  ✅ 2026-08-11 — 8 tests, ver `verification.md` §I. **Cierra la sección I.**
  > El recorte para un `organization_admin` se hace **por la gente**, no por la fila: `audit_log`
  > no guarda organización —no podría, audita cualquier entidad— así que ve lo que hicieron los
  > suyos y lo que se hizo sobre los suyos.

- [x] **T-076** *(agregada 2026-08-11)* `POST /minors` y `GET /me/dependents`: crear el perfil de
  un menor **sin cuenta propia** —persona y acudiente en una sola transacción— y la pantalla
  «Perfiles a cargo» que pide `spec.md` §10. 14 tests de integración + 9 de dominio.
  > **El plan no tenía esta tarea y HU-010-10 no se podía cumplir sin ella.** T-070 crea el vínculo
  > entre dos personas que ya existen, pero *no había forma de crear al menor*: `POST /users` exige
  > correo y crea cuenta, que es exactamente lo que un perfil de menor no tiene. Se descubrió al
  > escribir el E2E de T-102, que no tenía por dónde empezar.
  > Persona y vínculo se crean **juntos**: un menor sin acudiente es el estado roto que persigue el
  > job de T-071 —existe, se le puede cobrar, y no hay a quién cobrarle—, y partirlo en dos llamadas
  > es dejar que la segunda no ocurra.
  > El límite de edad sale de `identity.minor_profile_max_age` (P-04): un club puede querer 21.

- [x] **T-077** *(agregada 2026-08-11)* Los criterios de aceptación que ningún test cubría, que
  T-110 destapó al mapear `spec.md` contra la suite:
  - `POST /users` con `personId`: darle cuenta a **una persona que ya existe** sin duplicarla
    (HU-010-03 c2), que es también la conversión del perfil de menor que cumple la edad
    conservando su historia (HU-010-10 c3).
  - `invitationSentAt` en `UserResponse` (HU-010-01 c3): sin la fecha, un administrador no
    distingue una invitación de ayer de una de hace tres semanas y reenvía a ciegas.
  - Invitación **ligera**: `fullName` opcional al crear y nombre/teléfono al aceptar
    (HU-010-02 c1). La ficha nace con la parte local del correo —no en blanco— y el nombre que
    puso el club **no se pisa**: el enlace de invitación no es el lugar para que alguien se
    renombre.
  ✅ 2026-08-11 — 10 tests de integración nuevos.
  > De paso: el tope fijo de `procesarPendientes(500)` en los tests de la bandeja era una bomba de
  > tiempo —estalló cuando esta tarea agregó seis usuarios más y el mensaje propio quedó fuera del
  > lote. Ahora el tope se **cuenta**.

- [x] **T-078** *(agregada 2026-08-11)* Paginar `GET /users` según `docs/03` §7: página por defecto
  25, máximo 100, y **pedir más es `400`**, no un recorte silencioso. Respuesta `{ items, total,
  page, limit }`.
  ✅ 2026-08-11 — 6 tests. Salió de T-134: el listado **no tenía tope de ningún tipo** —ni el de 200
  que `verification.md` daba por hecho— así que un club con dos mil socios respondía dos mil filas
  en cada carga de la pantalla de administración.
  > `total` se cuenta con el **mismo** `where` que lista: contar con un filtro distinto es la forma
  > clásica de mostrar «137 resultados» sobre una tabla que enseña otra cosa.
  > El orden desempata por identificador: sin eso, dos personas llamadas igual pueden intercambiarse
  > entre consultas y salir dos veces en una página y ninguna en la siguiente.
  > **La exportación no se pagina** y va por su propio método, con tope de 5000: un CSV cortado en la
  > página 1 no es una exportación, porque quien lo abre no tiene forma de saber que le faltan filas.

## J — Notificaciones del módulo base

- [x] **T-090** Plantillas de correo (MJML) para: invitación, restablecimiento de contraseña,
  contraseña cambiada, cuenta suspendida/reactivada.
  ✅ 2026-08-11 — envoltura común en `mensajes.ts`, 1 test. **MJML no se montó**: resuelve el
  problema de mantener plantillas ricas, y hoy hay cuatro correos de un párrafo y un botón. Entra
  cuando haya diez con tablas, y entra en `correo()` sin tocar a quien encola. Ver `verification.md` §J.
  > Lo que sí trae la envoltura: estilos **en línea** (los clientes de correo ignoran las hojas de
  > estilo) y un *preheader*, el texto que la bandeja muestra junto al asunto. Sin él, Gmail muestra
  > lo primero que encuentre —«Si el botón no funciona»— y el correo parece basura sin abrirlo.
- [x] **T-091** `NotificationPreference`: el usuario elige qué avisos no críticos recibe; las
  de seguridad se envían siempre sin importar la preferencia (`docs/06` — regla dura).
  ✅ 2026-08-11 — `debeEnviarse` en dominio, `GET`/`PATCH /me/notification-preferences`, el
  procesador de la bandeja lo respeta. 10 tests de dominio + 9 de integración + 3 en `outbox`.
  **Cierra la sección J.**
  > La tabla es una **lista de exclusiones**: sin fila, se recibe. Al revés —tener que activar cada
  > aviso— la gente se queda sin enterarse de nada y culpa a la plataforma.
  > Los cuatro avisos de este módulo son inevitables: dos por seguridad y dos porque **son** el
  > mecanismo (apagar la invitación deja a la persona sin poder entrar). Por eso el `PATCH` acepta
  > cualquier tipo bien formado y no sólo los de `NOTIFICATION_TYPES`: si exigiera que prácticas o
  > copas editaran una constante de identidad antes de poder silenciar sus avisos, la sección
  > entera sería una pantalla sin nada que apagar.

- [x] **T-092** Adaptador real de correo: `SesMailer` (ADR-008) y elección del adaptador por
  entorno. Verificación: con `MAILER` sin definir y `NODE_ENV=production`, la aplicación **no
  arranca**; con `MAILER=ses` sin `MAIL_FROM`, tampoco. ✅ 2026-08-19 — 16 tests, ver
  `verification.md` §T-092.
  > **Tarea que apareció del despliegue, no del plan.** El único adaptador era `MailerDeArchivo`,
  > conectado sin condición de entorno, así que el primer despliegue real subió escribiendo los
  > correos a un archivo dentro del contenedor: SES ya estaba productivo y la instancia tenía
  > permiso para enviar, y ninguna invitación salía. Nadie podía ser invitado ni recuperar su
  > contraseña — el hito de la Fase 1, bloqueado, sin una sola señal de error.

## K — End-to-end

- [x] **T-100** E2E: administrador crea usuario → invitación llega (mailbox de prueba) →
  usuario define contraseña → inicia sesión → ve su panel.
- [x] **T-101** E2E: usuario olvida contraseña → restablece → sesiones anteriores quedan
  revocadas.
- [x] **T-102** E2E: acudiente crea/administra un perfil de menor y ve el consolidado en su
  estado de cuenta (stub de cobro, el módulo de pagos real es `specs/100`).
  ✅ 2026-08-11 — 8 tests en `test/e2e/identidad.e2e-spec.ts`. **Cierra la sección K.**
  > **El buzón es de verdad**: el correo no se lee de `outbox_message` sino del `.html` que escribe
  > `MailerDeArchivo`, y el token sale del enlace como lo sacaría alguien haciendo clic. Si el
  > enlace se arma mal, estos tests se caen — leyendo la tabla, no.
  > Del consolidado de T-102 se fija **lo que existe hoy**: que la plataforma sabe a quién cobrarle
  > (`isPrimaryPayer` vigente). El cobro en sí es `specs/100`, y fingir aquí un estado de cuenta
  > sería un test que pasa por un stub que nadie va a usar.
  > Un solo paso «a mano»: el club y su primera administradora, porque el arranque real
  > (`prisma/bootstrap.ts`) sólo corre cuando no hay ningún club y la suite comparte base.

## L — Cierre de módulo

- [x] **T-110** `verification.md`: marcar cada criterio de aceptación de `spec.md` con su test
  correspondiente (nombre de archivo + nombre de test). Cualquier criterio sin test
  identificado se resuelve antes de dar el módulo por terminado.
  ✅ 2026-08-11 — mapa completo en `verification.md` §L: **11 historias, 33 criterios**, cada uno
  con su archivo y el título literal de su test.
  > La tarea sirvió para lo que decía su última frase: **cuatro criterios no tenían test porque no
  > estaban implementados**. Se resolvieron en T-077 antes de marcar nada. Un mapa que hubiera
  > anotado «pendiente» en esas cuatro filas habría dado el módulo por terminado sin estarlo.
- [ ] **T-111** Demostración en staging desde un celular real (`docs/10` §3 punto 4) antes de
  continuar con el módulo 020.
  > **Desbloqueada 2026-08-11: ya no hace falta staging.** `pnpm dev:celular` sirve el producto en
  > la red local y lo abre en el teléfono sin instalar nada en él (`docs/10` §3.1). Lo que faltaba
  > no era el despliegue: era que `club-demo.localhost` no resuelve fuera del computador, y el club
  > se resuelve por subdominio (`ADR-013`).
  > De paso apareció que **`pnpm dev` no funcionaba**: el API arrancaba sin `DATABASE_URL` y moría
  > en la primera consulta. Un proyecto recién clonado no corría con el comando que documenta su
  > propio `CLAUDE.md`.
  > La tarea sigue abierta porque **la hace una persona**: mirar, tocar, y decir si se siente bien.

## M — Interfaz *(agregada 2026-08-11 — `plan.md` §9)*

> `spec.md` §10 enumeraba siete pantallas y **el módulo no tenía una sola tarea de frontend**. Es el
> hueco que dejó anotado `verification.md` §L. El orden lo fija `plan.md` §9.5: primero el recorrido
> por el que entra todo el mundo.

### M.1 — Los cimientos (sin ellos, cada pantalla los inventaría por su cuenta)

- [x] **T-120** `lib/api-client.ts`: un solo lugar que habla con el API — `credentials: "include"`,
  la cabecera de CSRF en toda mutación, y traducción del error de contrato a un tipo propio con su
  `code`. Tests: manda la cabecera, la omite en `GET`, y un `401` se distingue de un `422`.
  > Que el CSRF viva aquí y no en cada `useMutation` es la diferencia entre un olvido imposible y un
  > `403` incomprensible en producción.
  ✅ 2026-08-11 — 14 tests. Tres cosas que quedaron encerradas aquí y no se pueden olvidar:
  > `credentials: "include"` (sin él la aplicación entera sale anónima y el `401` no se explica
  > solo), la cabecera de CSRF en toda mutación, y `204` sin intentar parsear un cuerpo vacío.
  > `NetworkError` es una clase aparte de `ApiError` porque lo que se le dice a la persona es
  > distinto —«revisa tu conexión» y no «no tienes permiso»— y porque reintentar tiene sentido en
  > uno y no en el otro. `AbortError` se deja pasar tal cual: cancelar no es fallar.
- [x] **T-121** `lib/query-keys.ts` + proveedores en `__root.tsx` (Query, Router, tokens de marca).
  Tests: la aplicación monta y muestra la pantalla de ingreso.
  ✅ 2026-08-11 — 9 tests. Rutas por archivo con `@tanstack/router-plugin`; `routeTree.gen.ts` **se
  versiona**, porque generarlo en CI es un paso más que puede fallar distinto de como falla en la
  máquina de quien programa.
  > Las cuatro decisiones de TanStack Query están probadas, no comentadas: **un error del API no se
  > reintenta** (un `403` no mejora repitiéndolo), un fallo de red sí una vez, **ninguna mutación se
  > reintenta** —repetir un `POST` que quizá llegó crea dos usuarios, dos cobros, dos
  > inscripciones— y `staleTime` corto, porque ver una lista vieja de inscritos es peor que una
  > consulta de más.
  > La pantalla de ingreso es T-124; el test de esta tarea comprueba que el árbol de rutas monta.
- [x] **T-122** Traducción `código de error → texto en español` en `i18n/es-CO.ts`, con caída a un
  texto genérico **y aviso en consola** para los códigos sin traducir. Test: cada código que hoy
  devuelve el API tiene su texto.
  ✅ 2026-08-11 — 10 tests. La lista de códigos vive en `packages/contracts` (`CODIGOS_DE_ERROR`)
  porque **es el contrato**: `docs/03` §2 declara el `code` estable y ramificable por el cliente.
  Agregar uno al API sin traducirlo rompe el test a propósito — ya atrapó a `METHOD_NOT_ALLOWED`.
  > **El `message` del API no se muestra nunca.** Está en español y es correcto, pero se escribió
  > sin saber en qué pantalla iba a aparecer —«La operación no cumple una regla del club» es cierto
  > y no le sirve a nadie que está tratando de entrar— y vive fuera de `es-CO.ts`, donde el club no
  > puede revisarlo.
  > Un test comprueba que el texto de `CREDENTIALS_INVALID` **no** distingue «no existe» de
  > «contraseña mala»: el API responde un solo código a propósito (R-010-07, P-12), y separar los
  > textos aquí desharía esa protección desde el frontend.
- [x] **T-123** Tokens de marca de `docs/04` §1 en `packages/ui/tokens.css` + Tailwind 4 configurado.
  Test: el bundle no trae un color hex suelto fuera de ese archivo.
  ✅ 2026-08-11 — 3 tests. **Tailwind no estaba conectado**: el andamiaje traía `@import
  "tailwindcss"` sin `@tailwindcss/vite`, así que producía CSS y **ninguna utilidad**. Una clase
  como `bg-cream` no daba error, no aparecía en ningún log y el componente salía sin fondo. Se vio
  al mirar el CSS compilado, no al correr los tests.
  > Los tokens pasaron de `:root` a `@theme`, que es lo que Tailwind lee para generar las
  > utilidades además de publicar las variables. El CSS del build bajó de 21 KB a 5 KB, porque
  > recién ahí empezó a descartar lo que no se usa.
  > El test recorre los archivos de `apps/web` buscando `#hex`, `rgb(` y `hsl(`: sin él la regla de
  > `docs/04` §1 es una recomendación, y basta un `#fff` apurado para que el día que un club cargue
  > su propio color (`specs/140` HU-140-04) la pantalla quede a medio pintar.

### M.2 — El recorrido de T-100, que es por donde entra todo el mundo

- [x] **T-124** Pantalla de **ingreso** (`/login`): correo, contraseña, «recordarme», el mismo
  mensaje genérico para credenciales malas y el mensaje propio para cuenta suspendida. Muestra el
  nombre del club del subdominio (`GET /club/public`). Mobile-first, 44 px de objetivo táctil.
  ✅ 2026-08-11 — 8 tests. Incluye `/forgot-password`, que no estaba en su tarea: es la salida de
  emergencia **de esta pantalla**, y dejarla para T-129 habría significado un enlace muerto en la
  primera pantalla del producto. Usar el enlace (`/reset-password`) sigue siendo T-129.
  > Los campos van con `autoCapitalize="none"` y `autoCorrect="off"`: los teclados de celular
  > convierten un correo en «María@…» y la persona ve lo que escribió bien y un rechazo que no
  > entiende.
  > `packages/ui` estrena `Button`, `TextField` y `Alert`. No usan Radix: un `<button>` y un
  > `<input>` nativos ya traen foco, teclado y semántica. El primitivo entra cuando haga falta algo
  > que el HTML no da. `TextField` ata etiqueta, ayuda y error con `aria-describedby` para que
  > **nadie tenga que acordarse** de la accesibilidad, y el botón es `type="button"` por defecto
  > —al revés que el HTML— porque el default `submit` hace que un «cancelar» envíe el formulario.
- [x] **T-125** Guard de sesión (`_authenticated/route.tsx`): la sesión **no se guarda en el
  cliente**, se resuelve con `GET /me`; un `401` redirige a `/login` conservando a dónde iba.
  ✅ 2026-08-11 — 3 tests. Un `401` de `/me` **es la respuesta, no un fallo**: significa «no hay
  sesión». Un `500` sí es un fallo y se muestra como tal — tratarlo como falta de sesión sacaría a
  alguien de su cuenta por una caída del servidor, y volvería a sacarlo cada vez que reintentara.
  > La comprobación es **de conveniencia, no de seguridad**: cualquiera se la salta con las
  > herramientas del navegador. Lo que no se salta es al API, que exige sesión y permiso en cada
  > endpoint. Este guard existe para que nadie vea una pantalla vacía llena de errores.
- [x] **T-126** **Aceptar invitación** (`/accept-invitation?token=`): define contraseña —con la
  política visible antes de fallar— y, si el club invitó sólo con el correo, pide nombre y teléfono.
  Enlace vencido o usado: pantalla que dice qué hacer, no un error crudo.
  ✅ 2026-08-11 — 6 tests, y dos bugs que sólo los tests podían encontrar:
  > **La política de contraseñas no se estaba aplicando.** Estaba escrita como regla `validate` de
  > un campo, y cuando `useForm` usa un `resolver`, las reglas por campo **se ignoran por
  > completo**. El código se leía bien, nada fallaba, y la contraseña corta llegaba al servidor.
  > Ahora va dentro del esquema, con `validatePassword` de `packages/domain` — la misma función que
  > aplica el API, importada. No es duplicar la regla: es la regla.
  > **Un campo opcional en HTML llega como `""`, no como `undefined`**, y `min(1).optional()` lo
  > rechaza: dejar el nombre en blanco impedía enviar el formulario y señalaba como incorrecto un
  > campo que nadie tenía que llenar.
- [x] **T-127** **Panel propio** (`/`): quién es, sus roles, su categoría, y los accesos a lo suyo.
  Es la pantalla que cierra el recorrido de T-100 en el navegador.
  ✅ 2026-08-11 — 3 tests. **Todavía sin los accesos a las demás pantallas, y no es un olvido**: no
  existen. Cada una agrega el suyo al llegar (T-130 a T-136); un menú con enlaces a pantallas en
  blanco es peor que un panel corto.
  > A quien no tiene rol todavía —acaba de aceptar la invitación y el club no le asignó nada— se le
  > dice qué hacer. Un espacio en blanco ahí parece un error de la plataforma.
  > **Verificado contra el API real** con el club sembrado (`pnpm db:seed`), entrando por
  > `club-demo.localhost:5173`: ingreso, sesión y panel con sus roles y su organización.
- [x] **T-128** E2E de navegador (Playwright) del recorrido completo: el club invita → la persona
  define su contraseña → entra → ve su panel. **Es el pendiente que dejó `verification.md` §K.**
  ✅ 2026-08-11 — 3 recorridos en `apps/web/e2e`, contra el API y la aplicación de verdad, entrando
  por el subdominio del club sembrado. **Cierra la sección M.2 y el pendiente de §K.**
  > **Encontró un bug que ningún test de API podía encontrar**: el enlace del correo apuntaba a
  > `club-demo.localhost` **sin puerto**, así que en desarrollo no llevaba a ninguna parte. La
  > función que lo armaba estaba copiada en tres controladores y las tres copias tenían el mismo
  > error — se unificó en `club/url-del-club.ts` y el puerto sale de `WEB_PORT`. En producción no se
  > escribe: la web va en el 443 detrás del proxy inverso de `docs/07` §4.
  > El E2E abre el enlace **tal como llega**, que es exactamente lo que ningún test de API hacía:
  > los de `apps/api/test/e2e` leían el token del correo y llamaban al endpoint, sin pasar nunca por
  > la dirección.
  > El recorrido de R-010-09 usa **dos contextos de navegador**: es la única forma de comprobar de
  > verdad que la sesión del *otro* dispositivo muere al restablecer.

### M.3 — Lo propio de cada quien

- [x] **T-129** **Olvidé mi contraseña** y **restablecer** (`/forgot-password`, `/reset-password`):
  la misma respuesta exista o no la cuenta, y el aviso de que las demás sesiones se cerraron.
  ✅ 2026-08-11 — `/forgot-password` entró con T-124; aquí se cierra con `/reset-password`.
  > Al terminar **no queda dentro**: el API revoca todas las sesiones al cambiar la contraseña
  > (R-010-09), incluida la de este navegador. La pantalla lo dice y manda a ingresar, en vez de
  > llevar al panel y que la persona se encuentre con un `401` que no se explica.
- [x] **T-130** **Mi perfil** (`/me/profile`): editable vs. sólo lectura **diferenciado visualmente**
  (`docs/04`), y el cambio de correo con su confirmación pendiente a la vista.
  ✅ 2026-08-11 — 9 tests, incluida la pantalla de confirmación (`/me/confirm-email`).
  > Lo que administra el club **no se presenta como campo deshabilitado sino como dato**: un campo
  > gris invita a intentar escribir en él. Y borrar el teléfono manda `null`, no `""` — son cosas
  > distintas para el API.
  > La confirmación no tiene botón: llegar con el token **es** la confirmación. Lleva una guarda
  > contra el doble montaje de React 19 en modo estricto, que si no gastaría el token de un solo uso
  > en el primer montaje y mostraría «este enlace ya no sirve» sobre un cambio que sí funcionó.
- [x] **T-131** **Mis dispositivos** (`/me/sessions`): lista, cuál es la actual, cerrar una y cerrar
  todas.
  ✅ 2026-08-11 — 4 tests, y **un hueco del API que sólo se vio al construir la pantalla**: la
  columna `session.user_agent` existía desde T-002 y **el login nunca la llenaba**, así que la
  lista mostraba un guion por fila. Una pantalla para reconocer dispositivos ajenos en la que
  ningún dispositivo se distingue no sirve para nada. Corregido en `auth.service`, con su test.
  > Las fechas se muestran en la zona horaria **del club** (`GET /clubs/current/public`), no en una
  > constante: una sesión de las 7 p.m. en Bogotá figuraría como del día siguiente.
  > La sesión actual va marcada y **sin botón de cerrar**: cerrarla desde la lista se siente como un
  > accidente, y para eso está «cerrar sesión» en el panel.
- [x] **T-132** **Mis avisos** (`/me/notifications`): los inevitables se muestran en gris con su
  motivo, no se esconden — esconderlos haría creer que el sistema no los manda.
  ✅ 2026-08-11 — 2 tests. Hoy los cuatro avisos del módulo son inevitables, así que la pantalla no
  tiene nada que apagar todavía: el primer interruptor real llega con `specs/050`. Se construye
  igual porque el mecanismo ya existe y probarlo ahora es lo que evita que cada módulo invente el
  suyo.
- [x] **T-133** **Perfiles a cargo** (`/me/dependents`): los menores, quién paga, y si les falta
  firmar la exención.
  ✅ 2026-08-11 — 2 tests. Cada ficha contesta las dos preguntas que traen a alguien aquí: **¿a mí
  me van a cobrar lo de este niño?** (R-010-10) y **¿puede entrar a la cancha?** (R-010-12).
  > La fecha de nacimiento se arma a mano desde `YYYY-MM-DD`: `new Date("2015-03-04")` la interpreta
  > como medianoche UTC y en Bogotá la muestra un día antes. Es el mismo error que `LocalDate` evita
  > en el dominio, y aquí no había quien lo evitara.
  **Cierra la sección M.3.**

### M.4 — La administración del club

- [x] **T-134** **Listado de usuarios** (`/users`): filtros por estado, rol y texto, con exportación.
  Paginación real.
  ✅ 2026-08-11 — 7 tests. La decisión sobre la paginación se tomó **en el API**, ver T-078.
  > **Los filtros viven en la URL**, no en un `useState`: es lo que hace que «mándame el enlace de
  > los invitados que faltan» funcione, que «atrás» devuelva al filtro anterior y que recargar no
  > borre la búsqueda. En una pantalla de administración eso se nota el primer día.
  > La opción «Todos» manda cadena vacía y el cliente la **omite** del query: un `?status=` vacío
  > filtraría por un estado inexistente y devolvería cero resultados sin que nada falle.
  > La exportación es un `<a href>` y no una llamada de JavaScript: el navegador ya sabe guardar un
  > archivo que llega con `Content-Disposition`.
- [x] **T-135** **Crear/invitar** (`/users/new`): formulario mínimo, invitación ligera con sólo el
  correo, y el selector de roles **acotado a lo que quien lo usa puede otorgar**.
  ✅ 2026-08-11 — 3 tests. El acotamiento usa `canAssignRole` de `packages/domain`, **la misma
  función que aplica el API** (R-010-04). Esconder un rol no es la protección —el API decide en cada
  petición— pero ofrecer uno que va a rechazar hace perder el tiempo dos veces.
  > Verificado con la administradora del club sembrada: le ofrece administrador de club, comisario,
  > jugador y tesorero, y **no** superadministrador ni los de organización hasta elegir una.
- [x] **T-136** **Ficha de usuario** (`/users/$userId`): datos, roles, estado, acciones (suspender,
  archivar, reenviar invitación con su fecha de envío) e historial de auditoría de esa persona.
  ✅ 2026-08-11 — 5 tests. **Las acciones que el API rechazaría no se ofrecen**: sobre la propia
  cuenta no hay ninguna (R-010-05), «reactivar» sólo aparece si está suspendida, y «reenviar
  invitación» sólo si sigue invitada. Un botón que existe para responder un error es una promesa
  incumplida.
  > El historial muestra la acción con su nombre técnico (`user.suspended`) y no traducida: la lista
  > crece con cada módulo, y una traducción incompleta miente peor que un identificador. Ponerles
  > nombre es su propia tarea, cuando estén todas.
- [x] **T-137** Presupuesto de bundle como gate de CI (200 KB comprimidos, `ADR-014` punto 9).
  ✅ 2026-08-11 — `pnpm check:bundle`. **Hoy: 119.3 KB de 200.** Mide **gzip**, que es lo que viaja
  por el cable, y sólo la **carga inicial** —lo que `index.html` referencia—: las 27 pantallas que
  llegan por importación dinámica no las paga quien sólo entra a ver su panel.
  > El script falla si no encuentra ningún archivo referenciado: un gate que no puede fallar es peor
  > que no tenerlo, porque da confianza sin avisar de nada.
  **Cierra la sección M.4.**
