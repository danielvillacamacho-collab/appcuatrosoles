# SPEC-010 — Identidad, acceso y roles

> Estado: ready · Depende de: ninguno (módulo base) · Fuente: PRD Parte II completa
> (`docs/source/documento_consolidado_polo2.txt` §454-794), decisiones D-01 a D-04 (`docs/09`)

Módulo de referencia: éste es el primer módulo que se construye (`docs/roadmap.md` Fase 1) y
fija el formato y la profundidad esperada para los 14 restantes.

## 1. Problema

Hoy no existe una sola verdad sobre quién es quién en el club. La gente se identifica por
número de WhatsApp, un mismo jugador puede aparecer con datos distintos en dos hojas de
cálculo, y no hay forma de saber, sin preguntar, qué puede hacer cada persona ni desde cuándo.
Sin esto resuelto primero, ningún otro módulo tiene una base confiable sobre la cual pararse:
prácticas, copas, clases y pagos todos necesitan saber "quién es esta persona y qué puede
hacer" antes de poder hacer cualquier otra cosa.

## 2. Resultado esperado

Cada persona del club tiene un registro único. Quien tiene cuenta entra con correo y
contraseña desde su celular o computador y ve exactamente lo que le corresponde según sus
roles. Un administrador crea o invita cuentas, asigna roles, y puede suspender o archivar sin
perder el historial. Un menor de edad puede tener toda su vida deportiva registrada sin tener
correo propio, bajo la cuenta de su acudiente. Toda acción sensible queda auditada.

## 3. Fuera de alcance (en esta versión)

- Inicio de sesión con redes sociales o Google — evaluable a futuro (PRD Parte II §14).
- Verificación en dos pasos — prevista en el modelo, no se construye hasta decisión explícita
  (`docs/06-security-privacy.md` §10).
- Los permisos detallados de prácticas, copas, clases, caballos y pagos — se especifican en
  sus propios módulos (`specs/030` y siguientes); aquí sólo el mecanismo de roles y la matriz
  del módulo base.
- Facturación y contabilidad.
- Autoservicio de registro abierto: **`[SUPUESTO]`** confirmado como decisión de producto
  (PRD Parte II §4) — toda cuenta nace por creación o invitación de un administrador, nunca
  por registro libre desde internet.

## 4. Actores

| Rol | Alcance | Puede (resumen) |
|---|---|---|
| Superadministrador | plataforma | crear clubes/organizaciones, designar administradores, configuración global (detalle en `specs/140`) |
| Administrador del club | club | crear/gestionar usuarios, roles de club, categorías, tarifas, canchas, prácticas y copas del club |
| Administrador de organización | organización | gestionar personas, roles de organización, clases, coaches, paquetes, cobros y caballada de su organización |
| Comisario de polo | club | autoridad deportiva: edita handicaps, aprueba equipos, valida resultados (detalle en `specs/030`) |
| Profesor / instructor | organización | dicta clases, marca asistencia, sugiere aptitud de estudiantes |
| Petisero / groom | organización | ve y registra tareas de cuidado de caballos |
| Tesorería / administración | club u organización | ve estados de cobro y pago, concilia, exporta reportes |
| Jugador | club | rol base de toda cuenta activa: se postula, se inscribe, reserva, ve su perfil |

## 5. Historias de usuario

### HU-010-01 — Creación de usuario por administrador
**Como** administrador del club u organización **quiero** crear la cuenta de una persona
**para** darle acceso con los datos y roles correctos.

- **Dado** nombre completo, correo y categoría de membresía completos, **cuando** el
  administrador guarda, **entonces** la cuenta se crea en estado `invited` y se envía un
  correo de invitación con enlace para definir contraseña.
- **Dado** un correo que ya existe en el sistema, **cuando** el administrador intenta crear
  otra cuenta con ese correo, **entonces** el sistema lo impide y avisa que ya está
  registrado (sin revelar de quién es, sólo que existe — quien pregunta ya es administrador
  con permiso sobre ese ámbito, así que no aplica P-12 aquí).
- **Dado** una invitación enviada, **cuando** el administrador consulta el usuario,
  **entonces** ve el estado `invited` y la fecha de envío, y puede reenviarla.
- **Dado** un administrador de organización, **cuando** crea un usuario, **entonces** sólo
  puede asignarle roles dentro de su organización (nunca `commissioner` ni `club_admin`).

### HU-010-02 — Invitación con enlace (variante ligera)
**Como** administrador **quiero** invitar capturando sólo el correo **para** no tener que
llenar todos los datos de alguien que los va a completar él mismo.

- **Dado** sólo un correo (y opcionalmente un rol), **cuando** el administrador invita,
  **entonces** la persona completa sus propios datos al aceptar.
- **Dado** un enlace de invitación con más de 7 días (default, `docs/08` §9), **cuando** la
  persona intenta usarlo, **entonces** el sistema lo rechaza y pide al administrador
  reenviarlo.
- **Dado** un enlace de invitación ya usado, **cuando** se intenta usar de nuevo,
  **entonces** el sistema lo rechaza.

### HU-010-03 — Persona sin cuenta (invitado externo)
**Como** administrador de copa **quiero** registrar a un invitado externo sólo con nombre y
handicap **para** no obligarlo a crear una cuenta si sólo va a figurar en un partido.

- **Dado** un invitado externo sin cuenta, **cuando** se le registra para una copa,
  **entonces** existe como `person` sin `user_account`, sin bloquear su participación.
- **Dado** una `person` sin cuenta que más adelante necesita acceder, **cuando** se le crea
  la cuenta, **entonces** se vincula a la persona ya existente — nunca se duplica.

### HU-010-04 — Inicio de sesión
**Como** usuario registrado **quiero** iniciar sesión con mi correo y contraseña **para**
acceder a lo que me corresponde según mis roles.

- **Dado** una cuenta `active` con contraseña correcta, **cuando** el usuario inicia sesión,
  **entonces** accede a su panel según sus roles.
- **Dado** una contraseña incorrecta, **cuando** el usuario intenta entrar, **entonces** ve
  un error genérico ("correo o contraseña incorrectos") sin indicar cuál de los dos falló.
- **Dado** cuatro intentos fallidos previos, **cuando** el usuario falla el quinto,
  **entonces** la cuenta se bloquea temporalmente (15 min default) y se informa cuándo podrá
  reintentar.
- **Dado** una cuenta `suspended` o `archived` **y la contraseña correcta**, **cuando** intenta
  iniciar sesión, **entonces** el sistema no lo deja y muestra un mensaje acorde a su estado
  ("tu acceso está suspendido, contacta al club").
- **Dado** una cuenta en cualquier estado **y la contraseña incorrecta**, **cuando** intenta
  iniciar sesión, **entonces** recibe **exactamente** el mismo error genérico que si el correo
  no existiera — mismo texto, misma forma de respuesta.

  > **Precisión hecha en T-010, importante porque cambia lo que ve el usuario.** El PRD Parte II
  > §5 pide que una cuenta invitada, suspendida o archivada reciba «un mensaje acorde a su
  > estado», sin decir en qué momento. Tomado literalmente, cualquiera podría escribir un correo
  > y averiguar si tiene cuenta y si está suspendida: eso es enumeración de cuentas y, además,
  > filtrar el estado de un tercero (P-12). La regla queda entonces: **primero se verifica la
  > contraseña, y sólo después se revela el estado**. El titular legítimo —que es quien conoce su
  > contraseña— sigue recibiendo su mensaje útil; quien está probando correos no recibe nada.
  > Cuando el PRD y la constitución chocan, gana la constitución (`memory/constitution.md` §3).
  >
  > Consecuencia práctica: una cuenta `invited` no tiene contraseña usable, así que en la vida
  > real siempre caerá por el camino genérico. Para esa persona el camino correcto es reenviarle
  > la invitación (T-053), no un mensaje en la pantalla de ingreso.

### HU-010-05 — Cierre de sesión
**Como** usuario con sesión iniciada **quiero** cerrar sesión **para** proteger mi cuenta,
sobre todo en equipos compartidos.

- **Dado** una sesión iniciada, **cuando** el usuario cierra sesión, **entonces** queda
  deslogueado de inmediato y no puede ver contenido privado sin volver a entrar (ni con el
  botón "atrás" del navegador).
- **Dado** varios dispositivos con sesión activa, **cuando** el usuario elige "cerrar sesión
  en todos", **entonces** todas sus sesiones quedan revocadas.

### HU-010-06 — Recuperación y cambio de contraseña
**Como** usuario que olvidó su contraseña **quiero** restablecerla desde mi correo **para**
recuperar el acceso sin depender de un administrador.

- **Dado** un correo registrado, **cuando** el usuario pide restablecer, **entonces** recibe
  un enlace de un solo uso que expira en 1 hora (default).
- **Dado** cualquier correo (registrado o no), **cuando** se pide restablecer, **entonces**
  el sistema responde siempre el mismo mensaje, sin revelar si la cuenta existe.
- **Dado** un enlace de restablecimiento ya usado, **cuando** se intenta usar de nuevo,
  **entonces** el sistema lo rechaza y ofrece solicitar uno nuevo.
- **Dado** el uso exitoso de un enlace de restablecimiento, **cuando** se define la nueva
  contraseña, **entonces** se cierran todas las demás sesiones abiertas de esa cuenta.
- **Dado** la contraseña actual incorrecta, **cuando** el usuario intenta cambiarla desde su
  perfil, **entonces** el sistema no permite el cambio.

### HU-010-07 — Perfil propio
**Como** usuario **quiero** ver y editar mis datos **para** mantener mi información al día.

- **Dado** un usuario en su perfil, **cuando** edita su teléfono y guarda, **entonces** el
  dato queda actualizado de inmediato.
- **Dado** un usuario en su perfil, **cuando** intenta cambiar su propia categoría, roles o
  handicap, **entonces** no encuentra esa opción disponible — es de solo lectura para él.
- **Dado** un cambio de correo de acceso, **cuando** el usuario lo solicita, **entonces** se
  envía confirmación al correo nuevo y el cambio sólo se aplica al confirmarlo; el correo
  anterior sigue siendo válido mientras tanto.

### HU-010-08 — Gestión de usuarios (administración)
**Como** administrador **quiero** ver, buscar y administrar las cuentas **para** mantener
ordenada la comunidad del club.

- **Dado** un usuario `active`, **cuando** el administrador lo suspende, **entonces** deja de
  poder iniciar sesión y su estado pasa a `suspended`, con todas sus sesiones revocadas de
  inmediato.
- **Dado** un administrador de organización, **cuando** intenta ver un usuario de otra
  organización, **entonces** no aparece en su listado ni es accesible por id (`404`).
- **Dado** un administrador, **cuando** intenta suspenderse, archivarse o quitarse un rol a
  sí mismo, **entonces** el sistema lo impide.
- **Dado** un listado de usuarios, **cuando** el administrador exporta, **entonces** recibe
  un archivo con exactamente lo que ve filtrado en pantalla, nada más.

### HU-010-09 — Asignación de roles
**Como** administrador **quiero** asignar y retirar roles a una cuenta **para** que cada
persona pueda hacer exactamente lo que le corresponde.

- **Dado** una cuenta con rol `player`, **cuando** el administrador agrega `instructor`,
  **entonces** la persona pasa a poder dictar clases sin perder lo que ya podía hacer.
- **Dado** un administrador de organización, **cuando** intenta asignar el rol `commissioner`
  o `club_admin`, **entonces** la opción no está disponible para él.
- **Dado** cualquier asignación o retiro de rol, **cuando** ocurre, **entonces** queda
  registrado en auditoría (quién, a quién, qué rol, cuándo) y tiene efecto inmediato.

### HU-010-10 — Cuentas familiares y perfiles de menores
**Como** acudiente **quiero** administrar los perfiles de mis hijos menores **para**
reservar, pagar y firmar exenciones en su nombre sin que ellos necesiten cuenta propia.

- **Dado** un perfil de menor sin cuenta, **cuando** el titular reserva o paga a su nombre,
  **entonces** el cobro se consolida en el estado de cuenta del titular.
- **Dado** un menor con dos acudientes vinculados, **cuando** se define el pagador principal,
  **entonces** exactamente uno queda marcado como tal en un momento dado.
- **Dado** un perfil de menor que llega a la edad definida por el club (`docs/08`
  `identity.minor_profile_max_age`), **cuando** se convierte en cuenta propia, **entonces**
  conserva todo su historial deportivo y de pagos — no se recrea desde cero.

### HU-010-11 — Exención de responsabilidad (waiver)
**Como** club **quiero** que cada jugador acepte una exención antes de participar **para**
tener respaldo legal.

- **Dado** una persona sin aceptación vigente de la última versión del waiver, **cuando**
  intenta postularse a una práctica o reservar una clase, **entonces** el sistema lo bloquea
  y le pide aceptar primero (o a su acudiente, si es menor).
- **Dado** una nueva versión del waiver publicada, **cuando** una persona con aceptación de
  la versión anterior actúa, **entonces** se le vuelve a solicitar aceptación.

## 6. Reglas de negocio

- `R-010-01` Una persona tiene como máximo una cuenta de usuario (invariante de `person_id`
  único en `user_account`).
- `R-010-02` El rol define permisos; la categoría de membresía define tarifas y derechos.
  Son independientes: un socio puede ser también profesor.
- `R-010-03` Los permisos son acumulativos y nunca restrictivos entre sí — ningún rol quita lo
  que otro rol del mismo usuario permite.
- `R-010-04` Sólo `superadmin` y `club_admin` otorgan roles de alcance de club
  (`commissioner`, `club_admin`, `treasurer` de club). `organization_admin` sólo otorga roles
  dentro de su propia organización, y **únicamente** `instructor`, `groom` y `treasurer`.

  > **Precisión hecha en T-011.** «Roles dentro de su propia organización», leído literalmente,
  > incluiría `organization_admin` — es decir, un administrador de organización podría nombrar a
  > otro como él. `docs/06` §4 dice lo contrario («otorgado por `superadmin` o `club_admin`»), y se
  > resolvió por ese lado: si pudiera clonarse, **una sola cuenta comprometida se multiplica sin
  > que ningún administrador del club se entere**, y el club pierde la capacidad de saber quién
  > manda en sus organizaciones. El costo es que los administradores de organización los nombra el
  > club; con una o dos organizaciones es un trámite de un minuto. **Decisión revisable si en la
  > operación real resulta incómoda** — relajarla es una línea y su test.
  >
  > `superadmin` sólo lo otorga otro `superadmin`, y ningún rol del club llega a él.
  > El **comisario no otorga roles**: su autoridad es deportiva (handicaps, equipos, resultados),
  > no administrativa. Es intencional, no un olvido.
- `R-010-05` Un administrador no puede suspender, archivar ni retirarse roles a sí mismo.
- `R-010-06` Nada se borra desde la operación normal; los estados transicionan a `suspended`
  o `archived`, ambos reversibles por un administrador (P-06). El borrado real sólo procede
  por el flujo formal de datos personales (`docs/06-security-privacy.md` §8).
- `R-010-07` El mensaje de error de login y el de recuperación de contraseña nunca revelan si
  una cuenta existe (P-12). **En el login el orden es parte de la regla:** se verifica la
  contraseña primero y sólo después se evalúa el estado de la cuenta; sin contraseña correcta,
  todos los estados —incluida la cuenta inexistente— responden lo mismo. Implementado en
  `packages/domain/identity/resolveLoginOutcome` (T-010) para que el orden no dependa de que el
  controlador lo recuerde.
- `R-010-08` Un enlace de invitación vence en 7 días (default, `docs/08`); uno de
  restablecimiento, en 1 hora. Ambos son de un solo uso.
- `R-010-09` Al usar un enlace de restablecimiento de contraseña, se revocan todas las demás
  sesiones activas de esa cuenta.
- `R-010-10` Los cobros de un perfil de menor se consolidan siempre en el estado de cuenta de
  su pagador principal vigente (`guardianship.is_primary_payer`).
- `R-010-11` Toda asignación/retiro de rol, creación, suspensión y archivado de cuenta queda
  en `audit_log`, append-only (P-07).
- `R-010-12` No se puede postular a una práctica ni reservar una clase sin aceptación vigente
  del waiver más reciente (aplicado transversalmente por los módulos que lo requieran; el
  mecanismo de verificación vive aquí, en identidad).

## 7. Datos

Entidades de `docs/02-domain-model.md` §B usadas por este módulo: `person`, `user_account`,
`session`, `person_organization`, `role_assignment`, `commissioner_delegation`,
`guardianship`, `membership_assignment`, `waiver_version`, `waiver_acceptance`,
`practice_eligibility` (el mecanismo de "apto para práctica"; su uso funcional es de
`specs/050`, pero el dato y su ciclo de vida se administran desde aquí), `audit_log`.

No se agrega ninguna entidad nueva respecto a `docs/02` — este módulo consume el modelo ya
definido en su sección B.

## 8. Interfaz

```
POST   /auth/login                        público             { email, password, rememberMe }
POST   /auth/logout                        sesión
POST   /auth/logout-all                    sesión
POST   /auth/password/forgot               público             { email }
POST   /auth/password/reset                público             { token, newPassword }
POST   /me/password                        sesión              { currentPassword, newPassword }
GET    /me                                 sesión
PATCH  /me                                 sesión              { phone?, photoKey?, notificationPreferences? }
POST   /me/email-change                    sesión              { newEmail }
POST   /me/email-change/confirm            público (token)     { token }
GET    /me/sessions                        sesión
DELETE /me/sessions/:id                    sesión

GET    /users                              user.list           ?status&role&organizationId&categoryId&q
POST   /users                               user.create         { fullName, email, categoryId, roles[], organizationId? }
GET    /users/:id                          user.view
PATCH  /users/:id                          user.edit            { fullName?, email?, phone?, categoryId? }
POST   /users/:id/invite                   user.create          (reenvía invitación)
POST   /users/:id/suspend                  user.suspend
POST   /users/:id/reactivate                user.suspend
POST   /users/:id/archive                  user.archive
POST   /users/:id/restore                  user.archive
POST   /users/:id/roles                    role.assign          { role, scope, scopeId }
DELETE /users/:id/roles/:roleAssignmentId  role.assign
GET    /users/export                       user.export         (mismos filtros que el listado)

POST   /guardianships                      user.edit (propio ámbito)  { guardianPersonId, dependentPersonId, isPrimaryPayer }
POST   /waivers                            club_admin           { body } (publica nueva versión)
POST   /waivers/current/accept             sesión (o en nombre de dependiente)

GET    /audit-log                          audit.view           ?entityType&entityId&actorId
```

Todo endpoint mutante declara su permiso (`docs/03-api-conventions.md` §6); la tabla completa
de qué rol tiene cada permiso va en `docs/06-security-privacy.md` §4 y se amplía en
`plan.md` de este módulo.

## 9. Dominio puro

```ts
// packages/domain/identity
function canAssignRole(actor: RoleContext, targetRole: Role, targetScope: Scope): Result<void, ForbiddenRoleAssignment>
function accountStatusAllowsLogin(status: AccountStatus): boolean
// T-010: resuelve el intento completo, con el orden «contraseña primero» dentro (R-010-07)
function resolveLoginOutcome(input: { credentialsValid: boolean; status: AccountStatus }): LoginOutcome
function resolvePrimaryPayer(guardianships: Guardianship[], now: Date): Result<PersonId, NoPrimaryPayer>
function isWaiverAcceptanceCurrent(acceptance: WaiverAcceptance | null, currentVersion: WaiverVersion): boolean
// T-012: la ventana de validez entra como configuración (P-04), no como constante del dominio
function isInvitationLinkValid(invitation: InvitationLink, policy: InvitationLinkPolicy, clock: Clock): Result<void, InvitationLinkDenial>
```

Todas puras, sin acceso a base de datos ni al reloj del sistema (P-08) — reciben `now` donde
lo necesitan.

## 10. Pantallas

- **Login** — correo, contraseña, "recordarme", enlace a recuperación. Ya hay referencia
  visual del tono de marca en `docs/brand/sistema-diseno-mockup.dc.html`.
- **Recuperar/restablecer contraseña** — dos pasos, mensajes según §6 R-010-07.
- **Mi perfil** — datos editables vs. sólo lectura, claramente diferenciados visualmente
  (`docs/04-frontend-conventions.md`).
- **Mis sesiones/dispositivos** — lista con "cerrar esta sesión" y "cerrar todas".
- **Listado de usuarios (admin)** — tabla con filtros y exportación, según HU-010-08.
- **Ficha de usuario (admin)** — datos, roles, estado, acciones, historial de auditoría de esa
  persona.
- **Crear/invitar usuario (admin)** — formulario mínimo + selector de roles según el alcance
  del administrador que lo usa.
- **Perfiles a cargo (acudiente)** — lista de menores, acceso a la ficha de cada uno.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Un administrador de organización asigna un rol de club por un bug de UI, no de API | la API rechaza (`R-010-04`) independientemente de qué muestre el frontend; test de autorización obligatorio |
| Enumeración de cuentas vía mensajes de error distintos | mensajes únicos y probados en login y recuperación (`R-010-07`, `docs/05` §3) |
| Un menor queda sin pagador principal vigente por vencimiento de `guardianship` | `resolvePrimaryPayer` devuelve error explícito; la aplicación no permite que un cobro quede sin payer, se alerta al administrador |
| Bloqueo accidental del único administrador de un club | `R-010-05` impide autosuspensión; además, `superadmin` siempre puede reactivar |
| Fuga de datos de menores entre organizaciones | mismas pruebas de aislamiento que cualquier otro dato (`docs/06` §5), sin excepción por tratarse de un menor — al contrario, es el dato más sensible |

## 12. Definición de terminado

- [ ] Las 11 historias de usuario cubiertas por tests con nombre legible en español
- [ ] Test de aislamiento: administrador de organización no ve ni accede a usuarios de otra
- [ ] Test de autorización en cada endpoint mutante (rol permitido y rol denegado)
- [ ] Login y recuperación de contraseña no revelan existencia de cuenta (test explícito)
- [ ] `audit_log` recibe entrada en cada acción listada en R-010-11 (test explícito)
- [ ] Demostrado en staging: crear una persona real del club de principio a fin, desde un
      celular, incluyendo aceptación del waiver
