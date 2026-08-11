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

- [ ] **T-110** `verification.md`: marcar cada criterio de aceptación de `spec.md` con su test
  correspondiente (nombre de archivo + nombre de test). Cualquier criterio sin test
  identificado se resuelve antes de dar el módulo por terminado.
- [ ] **T-111** Demostración en staging desde un celular real (`docs/10` §3 punto 4) antes de
  continuar con el módulo 020.
