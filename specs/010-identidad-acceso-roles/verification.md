# VERIFICATION-010 — Identidad, acceso y roles

Evidencia por tarea. Se llena a medida que avanza el módulo; el cierre formal (todos los
criterios de aceptación de `spec.md` §12 marcados) es T-110.

---

## T-001 — Modelos `Person`, `UserAccount`, `Session` + migración

**Fecha:** 2026-08-10 · **Migración:** `20260810200559_identity_person_account_session`

### Verificación exigida por la tarea

| Criterio | Resultado |
|---|---|
| `pnpm db:migrate:dev` corre limpio | ✅ migración creada y aplicada contra PostgreSQL 16 real (contenedor de `docker-compose.yml`) |
| La migración revierte con `down` | ✅ ciclo **up → down → up** ejecutado completo: `down.sql` deja 0 tablas de negocio y 0 enums; `migrate deploy` la re-aplica |

### Cumplimiento de principios (comprobado contra la base, no asumido)

| Principio | Cómo se verificó | Resultado |
|---|---|---|
| P-08 · timestamps en UTC | consulta a `information_schema.columns` | ✅ 11/11 columnas de fecha-hora son `timestamp with time zone`; **0** sin zona. `birthdate` es `date` (es una fecha, no un instante) |
| `docs/02` · `id` = UUID v7 ordenable | inserción de dos filas consecutivas | ✅ nibble de versión `7` (`019fed4f-7ffd-7a43-…`) y `id₁ < id₂` |
| `docs/02` · nombres en snake_case | SQL de la migración | ✅ tablas `person`, `user_account`, `session`; columnas `club_id`, `full_name`, `password_hash`… |
| P-06 · nada se borra por accidente | SQL de la migración | ✅ las dos llaves foráneas quedaron `ON DELETE RESTRICT` |
| R-010-01 · una persona, máximo una cuenta | intento de crear una segunda cuenta para la misma persona | ✅ rechazado con `P2002` |
| `docs/09` D-05 · correo de acceso único global | intento de reusar el correo en otro club | ✅ rechazado con `P2002` |
| HU-010-01 · la cuenta nace `invited` | lectura del registro creado | ✅ `status = invited`, `failed_attempts = 0` |

### Hallazgos que corrigieron el plan

1. **T-005 no necesita SQL crudo.** El plan asumía un índice parcial
   `UNIQUE(club_id, email) WHERE email IS NOT NULL`. Comprobado empíricamente: PostgreSQL ya
   trata los `NULL` como distintos en un índice único, así que el `@@unique([clubId, email])`
   normal de Prisma da el comportamiento pedido — dos personas del mismo club con `email`
   vacío conviven, y el mismo correo no vacío choca. T-005 se reduce a automatizar el test.
2. **Riesgo R-1 resuelto** como `docs/09` D-05 (un correo = un acceso, con club activo en la
   sesión). Se corrigió la nota contradictoria de `docs/02` §B, que decía "único por club".
3. **Prisma estaba en la versión equivocada.** El andamiaje quedó en 5.22 cuando `ADR-002`
   especifica Prisma 6; se corrigió a 6.19.3 antes de generar la primera migración.
4. **El CI probaba mal la reversibilidad.** Usaba `prisma migrate reset`, que es destructivo y
   no prueba el `down` de la migración. Ahora aplica el `down.sql` real, borra la fila de
   `_prisma_migrations` y re-aplica — y **falla si una migración llega sin `down.sql`**.

### Pendiente declarado

- La verificación de esta tarea se hizo con una prueba de humo **manual y desechable**, no
  versionada. Los tests automatizados del módulo empiezan en T-010 (dominio puro) y los de
  integración contra Postgres en T-030 en adelante. Hasta entonces, estas garantías **no
  están protegidas contra regresión** — es deuda conocida y acotada, no un descuido.

---

## T-002 — `PersonOrganization`, `RoleAssignment`, `CommissionerDelegation`

**Fecha:** 2026-08-10 · **Migración:** `20260810204818_identity_organizations_roles_delegation`

### Verificación exigida por la tarea

| Criterio | Resultado |
|---|---|
| Migración `up`/`down` contra Postgres real | ✅ ciclo completo, y además **reversión en cascada**: revertir T-002 deja intactas las tablas de T-001; revertir T-001 encima deja la base vacía sin un solo error; volver a aplicar reconstruye todo |

### Invariantes puestos en la base de datos (P-09), cada uno probado provocando el rechazo

Se añadieron en SQL dentro de la migración, porque Prisma no sabe expresarlos. **Todos
comprobados en ambas direcciones** — que rechacen lo que deben y permitan lo que deben:

| Invariante | Comprobación |
|---|---|
| Un mismo rol con el mismo alcance no se otorga dos veces a la vez | ✅ segundo intento rechazado; ✅ el mismo rol con **otro** alcance sí se permite; ✅ tras revocar, se puede volver a otorgar (el índice es parcial) |
| `scope_id` es NULL exactamente cuando `scope = platform` | ✅ `platform` **con** `scope_id` → rechazado; ✅ `club` **sin** `scope_id` → rechazado; ✅ `platform` sin `scope_id` → permitido |
| Un vínculo persona-organización no se duplica mientras esté activo | ✅ duplicado exacto rechazado; ✅ la misma persona puede ser `student` **y** `team_member` en la misma organización |
| `left_on >= joined_on` | ✅ salir antes de entrar → rechazado |
| `ends_at > starts_at` en una delegación | ✅ terminar antes de empezar → rechazado |
| `delegator_id <> delegate_id` | ✅ el comisario no se delega a sí mismo |

### Decisiones de modelado tomadas y su razón

1. **`club_id` agregado a `person_organization` y `commissioner_delegation`**, aunque `docs/02`
   no lo listaba: P-05 dice que toda tabla de negocio lo lleva. El valor está en que el filtro
   de tenant de la capa de repositorio sea **uniforme**, sin un join distinto por tabla ni una
   lista de excepciones que alguien deba recordar.
2. **`role_assignment` es la única excepción deliberada a P-05.** No lleva `club_id` porque
   `scope` + `scope_id` ya *son* la frontera de tenant, y un `superadmin` tiene
   `scope = platform`, donde no hay club. Un `club_id` paralelo sería una segunda fuente de
   verdad capaz de contradecir a `scope_id`. Queda documentado en el esquema y en `docs/02`
   para que no se lea como un olvido.
3. **`revoked_by_id` con `onDelete: Restrict`**, corrigiendo el `SET NULL` que Prisma pone por
   defecto en relaciones opcionales: `SET NULL` borraría en silencio **quién revocó un rol**,
   justo el dato que la auditoría existe para conservar (P-07).
4. **Los punteros de auditoría son llaves foráneas reales** (`granted_by_id`, `revoked_by_id`,
   `delegator_id`, `delegate_id`): un puntero a una cuenta inexistente haría inútil el registro
   precisamente cuando se necesita.

### Hallazgo importante: el generador de `down.sql` estaba mal

Al automatizar la generación del `down` se descubrió que compararlo contra el **esquema actual**
produce un `down` que deshace también las migraciones **posteriores**: el `down` de T-001 salía
borrando las tablas de T-002, y encadenar reversiones habría fallado al borrar algo ya borrado.
Corregido reconstruyendo ambos extremos del diff desde las carpetas de migración, y encapsulado
en `scripts/down-sql.sh` (`pnpm db:down-sql`) para que no dependa de que alguien recuerde el
detalle. Un `down` sólo se ejerce el día del rollback, que es el peor momento para descubrirlo.

### Pendiente declarado

- Igual que T-001: verificado con prueba de humo **manual y desechable**. Los 14 chequeos de
  invariantes de esta tarea **no están protegidos contra regresión** hasta que existan los tests
  de integración (T-030 en adelante). Deuda conocida y acotada.
- `person_organization.organization_id` sigue sin llave foránea porque la tabla `organization`
  la crea el **módulo 020**. Anotado como entregable de 020 en el propio `schema.prisma`: hasta
  entonces nada impide una fila apuntando a una organización inexistente, y eso toca P-05.

---

## T-003 — `MembershipCategory`, `MembershipAssignment`, `Guardianship`

**Fecha:** 2026-08-10 · **Migración:** `20260810210251_identity_membership_and_guardianship`

### Verificación exigida por la tarea

| Criterio | Resultado |
|---|---|
| Migración `up`/`down` contra Postgres real | ✅ ciclo completo; el `down` revierte sólo T-003 y el `EXCLUDE` se reconstruye al volver a aplicar |

### El primer dinero del proyecto (P-02), demostrado

`membership_category.monthly_fee_cents` es el primer campo de dinero. Quedó `BIGINT` en la base
y `BigInt` en el cliente. La prueba no se quedó en «funciona con una cuota normal»:

| Comprobación | Resultado |
|---|---|
| Cuota realista (1.500.000 COP = 150.000.000 centavos) vuelve exacta y como `BigInt` | ✅ |
| Un valor por encima de 2⁵³ (`9007199254740993`) **no pierde precisión** | ✅ |
| …y el mismo test demuestra que en punto flotante ese número y su vecino **son el mismo valor** (`9007199254740992`) | ✅ |
| Cuota de cero es válida (hay categorías sin cuota) | ✅ |
| Cuota negativa es rechazada | ✅ |

Esa tercera línea es la razón de existir de P-02, hecha evidencia ejecutable en lugar de
argumento: si el dinero pasara por un `number` de JavaScript, dos cifras distintas de centavos
serían indistinguibles.

### La regla de producto del PRD §2, vuelta imposible de violar

*«Cada persona tiene una única categoría vigente a la vez, pero la plataforma guarda el
historial»* dejó de ser una intención y pasó a ser un `EXCLUDE USING gist` sobre
`(person_id, daterange(effective_from, effective_to, '[)'))`:

| Comprobación | Resultado |
|---|---|
| Dos categorías con períodos solapados para la misma persona | ✅ rechazado por la base |
| Abrir una segunda membresía mientras hay una vigente sin cerrar | ✅ rechazado |
| Cambio de categoría el mismo día en que termina la anterior | ✅ **permitido** — el rango semiabierto `'[)'` hace válido el caso normal |
| Una membresía que termina antes de empezar | ✅ rechazado |

Vale la pena notar el tercer caso: un constraint que rechazara también los períodos adyacentes
habría hecho imposible el cambio de categoría normal. El invariante correcto no es «que no se
toquen», es «que no se solapen».

### Cuentas familiares (R-010-10)

| Comprobación | Resultado |
|---|---|
| Un menor con **dos** acudientes (madre y padre) | ✅ permitido |
| Dos pagadores principales vigentes para el mismo menor | ✅ rechazado |
| El mismo acudiente vinculado dos veces al mismo menor | ✅ rechazado |
| Nadie es acudiente de sí mismo | ✅ rechazado |
| Vínculo que termina antes de empezar | ✅ rechazado |

**División honesta de la garantía:** la base asegura «**como máximo** un pagador principal
vigente». El «**al menos** uno» depende de la fecha y no cabe en un constraint — lo vigila el job
diario de integridad (T-071). Media garantía está en el motor y media en la aplicación, y eso
queda escrito para que nadie asuma más de lo que hay.

### Decisiones de modelado

1. **`code` de categoría es texto, no un enum.** Las categorías son un catálogo administrable
   (P-04, PRD §16): el club puede crear las suyas sin que nadie despliegue. Un enum las habría
   congelado en el código.
2. **`monthly_fee_cents` es el valor vigente, no un histórico.** Los importes ya cobrados se
   congelan en `charge.amount_cents` (módulo 100), así que cambiar la cuota no reescribe el
   pasado. Se documentó en el esquema para que nadie añada una tabla de histórico creyendo que
   falta.
3. **`effective_from`/`effective_to` y `starts_on`/`ends_on` son `DATE`, no timestamps.** Un
   cambio de categoría «aplica desde el siguiente ciclo de facturación»: eso es un día, no un
   momento del día.
4. **`btree_gist` se crea aquí** y el `down` **no** la elimina a propósito: es una capacidad del
   motor, no un dato de este módulo, y los módulos 040 (canchas) y 090 (caballos) la necesitan
   para su propio antidoble-reserva.

### Pendiente declarado

- Igual que T-001 y T-002: los 17 chequeos son una prueba de humo **manual y desechable**. Sin
  protección contra regresión hasta los tests de integración (T-030 en adelante).
- `membership_category.rights` es `jsonb` sin validación de forma en la base. La estructura la
  debe validar el dominio (Zod) cuando se implemente la gestión de categorías; hoy nada impide
  guardar una clave mal escrita.

---

## T-004 — `WaiverVersion`, `WaiverAcceptance`, `AuditLog` (append-only)

**Fecha:** 2026-08-10 · **Migración:** `20260810211235_identity_waivers_and_audit_log`

### La tarea se partió al ejecutarla, y por qué

`tasks.md` pedía `REVOKE UPDATE, DELETE ... para el rol de aplicación`. Al ir a hacerlo apareció
un problema de fondo: **la aplicación se conecta con un rol que es superusuario y dueño de la
tabla**, y en PostgreSQL tanto el superusuario como el dueño saltan toda comprobación de
permisos. Ese `REVOKE` habría sido código que parece proteger y no protege — una garantía falsa,
que es peor que ninguna, porque nadie la vuelve a revisar.

Se implementó con **triggers**, que sí aplican a todo el mundo. El `REVOKE` sigue siendo deseable
como segunda capa y quedó como **T-007**, porque crear un rol sin privilegios toca
`docker-compose`, `.env`, el despliegue y el CI — más de lo que cabe en una tarea.

### Append-only, verificado en la forma más fuerte posible

Las tres operaciones se probaron **conectado como el superusuario** (`polo`, `usesuper = t`):

| Operación | Resultado |
|---|---|
| `INSERT` | ✅ permitido (es el único camino de escritura) |
| `SELECT` | ✅ permitido |
| `UPDATE` | ✅ **rechazado** — `audit_log es append-only: la operacion UPDATE no esta permitida (constitution P-07)` |
| `DELETE` | ✅ **rechazado** |
| `TRUNCATE` | ✅ **rechazado** |
| La fila, tras los tres intentos | ✅ intacta y sin alterar |

Y desde la aplicación (Prisma), los mismos tres caminos fallan, incluido `deleteMany`.

**`TRUNCATE` necesitaba su propio trigger.** No dispara los de `DELETE`: sin esa tercera línea,
un solo `TRUNCATE audit_log` habría vaciado la auditoría entera sin encontrar resistencia. Es
justamente la operación que alguien usaría para «limpiar».

### Waivers (HU-010-11)

| Comprobación | Resultado |
|---|---|
| Publicar la versión 1 y luego la 2, cada una con su texto | ✅ la 2 no sobreescribe la 1 |
| Repetir el número de versión dentro del mismo club | ✅ rechazado |
| Versión cero o negativa | ✅ rechazado |
| Una persona adulta acepta por sí misma | ✅ |
| La misma persona acepta dos veces la misma versión | ✅ rechazado |
| **El acudiente acepta en nombre del menor** (`person_id` ≠ `accepted_by_person_id`) | ✅ permitido |
| La misma persona con aceptaciones de versiones distintas | ✅ permitido — eso es el historial |

`body` guarda el texto completo, no una referencia a un archivo: si en 2029 se discute qué se
aceptó en 2026, la respuesta tiene que ser ese texto exacto y no el vigente.

### Auditoría: dos casos de modelado que importan

1. **`club_id` es nulable.** Una acción de alcance de plataforma (crear un club) no cuelga de
   ningún club. Verificado que se puede auditar con `club_id = NULL`. La capa de repositorio
   debe tratar ese NULL explícitamente: esas filas sólo las ve un superadministrador.
2. **`entity_id` no tiene llave foránea, a propósito.** Es polimórfico: la auditoría cubre
   cualquier entidad del sistema y debe sobrevivir aunque la entidad ya no exista. `actor_user_id`
   y `on_behalf_of_id` **sí** son llaves foráneas con `Restrict`, por la misma razón que en
   T-002: un puntero roto haría inútil el registro justo cuando se necesita.

### Límites honestos de la garantía

- **Protege datos, no DDL.** `DROP TABLE` sí funciona — verificado al probar el `down`. Es
  deliberado: revertir una migración es un acto administrativo explícito, no manipulación de
  datos. La auditoría no puede editarse; el esquema sí puede revertirse.
- **Tensión pendiente con la Ley 1581.** `docs/06` §8 exige poder anonimizar datos personales a
  solicitud del titular, pero `before`/`after` pueden contener nombre o correo y hoy son
  inmodificables. Ese flujo necesitará una vía privilegiada y auditada de redacción cuando se
  construya. Se dejó **declarado** y no se debilitó el trigger por adelantado.
- **Los tests que escriban en `audit_log` no pueden limpiar lo que escribieron.** Necesitan base
  de datos nueva por corrida (Testcontainers), no limpieza posterior. Afecta a T-081.
- Tras un `down`, la función `audit_log_append_only()` queda en la base sin sus triggers.
  Inofensivo e idempotente (`CREATE OR REPLACE`); documentado en `docs/05` §6 como límite
  conocido del generador de `down.sql`.

### Pendiente declarado

- Los 15 chequeos son, otra vez, prueba de humo **manual y desechable**. La red contra regresión
  llega con T-081 (test que verifica que cada acción auditable deja exactamente una fila).
