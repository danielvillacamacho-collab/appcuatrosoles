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
- [ ] **T-033** Rechazo de login por estado `invited`/`suspended`/`archived` con mensaje
  específico por estado (no el genérico de credenciales).
- [ ] **T-034** `POST /auth/logout` y `POST /auth/logout-all`. Test: sesión cerrada no sirve
  ni con "atrás" del navegador (repetir la misma request con la cookie vieja → `401`).
- [ ] **T-035** `POST /auth/password/forgot`: mismo mensaje exista o no la cuenta (R-010-07);
  encola `identity.send-password-reset` en la misma transacción (P-11).
- [ ] **T-036** `POST /auth/password/reset`: token de un solo uso, expira en 1h, revoca las
  demás sesiones al usarse (R-010-09). Tests: token usado dos veces, token expirado.
- [ ] **T-037** `POST /me/password` (cambio estando dentro): valida contraseña actual, exige
  las dos nuevas contraseñas coincidentes, rechaza si la actual es incorrecta.
- [ ] **T-038** Política de complejidad de contraseña (mínimo 8, letras+números, rechaza lista
  de comunes) + Argon2id con parámetros documentados (`plan.md` §7 riesgo de configuración).

## E — Perfil propio (`me/`)

- [ ] **T-040** `GET /me`: devuelve datos propios, roles, categoría, organizaciones — sin
  exponer campos administrativos que el propio usuario no debe editar.
- [ ] **T-041** `PATCH /me`: sólo permite editar teléfono, foto, preferencias de notificación.
  Test: un intento de mandar `categoryId` o `roles` en el body no tiene efecto (se ignora, no
  se rechaza con error — para no filtrar la existencia del campo a quien no debería tocarlo).
- [ ] **T-042** `POST /me/email-change` + `POST /me/email-change/confirm`: correo anterior
  sigue válido hasta confirmar el nuevo.
- [ ] **T-043** `GET /me/sessions` y `DELETE /me/sessions/:id`.

## F — Gestión de usuarios (`users/`)

- [ ] **T-050** `POST /users`: creación por administrador, estado inicial `invited`, encola
  `identity.send-invitation` en la misma transacción. Test de contrato + HU-010-01 camino
  feliz.
- [ ] **T-051** `POST /users` — rechazo por correo duplicado (HU-010-01, segundo criterio).
- [ ] **T-052** `POST /users` — administrador de organización sólo puede asignar roles dentro
  de su organización al crear (usa `canAssignRole` de T-011).
- [ ] **T-053** `POST /users/:id/invite` (reenvío) — nueva invitación, el enlace anterior deja
  de ser válido.
- [ ] **T-054** `GET /users` con filtros (`status`, `role`, `organizationId`, `categoryId`,
  `q`) + aislamiento: administrador de organización nunca ve usuarios de otra (HU-010-08,
  segundo criterio) — test de aislamiento explícito.
- [ ] **T-055** `GET /users/:id` y `PATCH /users/:id`. Test de aislamiento igual que T-054
  sobre acceso directo por id (`404`, no `403`, si es de otro ámbito administrable — ver
  `docs/03` §3 tabla de códigos).
- [ ] **T-056** `POST /users/:id/suspend` y `/reactivate`: suspender revoca todas las sesiones
  activas de inmediato (test explícito, no basta con cambiar el estado en base de datos).
- [ ] **T-057** `POST /users/:id/archive` y `/restore`.
- [ ] **T-058** Auto-protección: `suspend`/`archive`/retirar rol sobre el propio actor →
  rechazado (R-010-05) sin importar que sea `superadmin`.
- [ ] **T-059** `GET /users/export`: mismo filtro que el listado, formato Excel/CSV.

## G — Roles (`roles/`)

- [ ] **T-060** `POST /users/:id/roles`: usa `canAssignRole`; registra en `audit_log` con
  quién/a quién/qué rol/cuándo (R-010-11).
- [ ] **T-061** `DELETE /users/:id/roles/:roleAssignmentId`: retiro de rol, efecto inmediato
  (test: una request inmediatamente posterior con ese rol ya no pasa el `PermissionGuard`).
- [ ] **T-062** Test de integración específico de R-010-04: administrador de organización
  intentando `role.assign` con `scope=club` → `403`.

## H — Familias, membresía y waivers

- [ ] **T-070** `POST /guardianships`: crea vínculo, cierra automáticamente el `endsOn` de un
  payer anterior si el nuevo se marca `isPrimaryPayer=true` (mantiene el invariante "exactamente
  uno vigente", `plan.md` §7).
- [ ] **T-071** Job `identity.check-primary-payer-integrity` (cron diario): detecta
  dependientes activos sin payer vigente, notifica al administrador. Test: fixture con el caso
  roto, confirma que el job lo detecta.
- [ ] **T-072** `MembershipAssignment`: alta y consulta de categoría vigente por persona
  (histórico, nunca se sobreescribe — sólo se agrega fila nueva).
- [ ] **T-073** `POST /waivers` (`club_admin`): publica nueva versión.
- [ ] **T-074** `POST /waivers/current/accept`: acepta en nombre propio o, si la persona es
  menor, registrado por el acudiente (`acceptedByPersonId`).
- [ ] **T-075** Guard/helper reutilizable `assertWaiverAccepted(personId)` para que otros
  módulos (prácticas, clases) lo llamen sin reimplementar la regla (R-010-12).

## I — Auditoría

- [ ] **T-080** `GET /audit-log` con filtros y aislamiento por ámbito del solicitante
  (`organization_admin` sólo ve auditoría de su organización).
- [ ] **T-081** Test transversal: cada acción de la lista de R-010-11 (crear, suspender,
  archivar, asignar/retirar rol) deja **exactamente una** fila de auditoría, ni cero ni dos.

## J — Notificaciones del módulo base

- [ ] **T-090** Plantillas de correo (MJML) para: invitación, restablecimiento de contraseña,
  contraseña cambiada, cuenta suspendida/reactivada.
- [ ] **T-091** `NotificationPreference`: el usuario elige qué avisos no críticos recibe; las
  de seguridad se envían siempre sin importar la preferencia (`docs/06` — regla dura).

## K — End-to-end

- [ ] **T-100** E2E: administrador crea usuario → invitación llega (mailbox de prueba) →
  usuario define contraseña → inicia sesión → ve su panel.
- [ ] **T-101** E2E: usuario olvida contraseña → restablece → sesiones anteriores quedan
  revocadas.
- [ ] **T-102** E2E: acudiente crea/administra un perfil de menor y ve el consolidado en su
  estado de cuenta (stub de cobro, el módulo de pagos real es `specs/100`).

## L — Cierre de módulo

- [ ] **T-110** `verification.md`: marcar cada criterio de aceptación de `spec.md` con su test
  correspondiente (nombre de archivo + nombre de test). Cualquier criterio sin test
  identificado se resuelve antes de dar el módulo por terminado.
- [ ] **T-111** Demostración en staging desde un celular real (`docs/10` §3 punto 4) antes de
  continuar con el módulo 020.
