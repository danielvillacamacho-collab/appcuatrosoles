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

---

## T-005 — Unicidad del correo, y el primer test automatizado del proyecto

**Fecha:** 2026-08-10

### Lo que se verificó (ya no a mano)

Primer test que corre solo y falla si alguien rompe el comportamiento:
`apps/api/test/integration/person-email.int-spec.ts`, 4 tests, contra PostgreSQL 16 real.

| Test | Qué fija |
|---|---|
| Dos personas del mismo club con correo vacío | Conviven — los `NULL` son distintos entre sí |
| Dos personas del mismo club con el mismo correo | Rechazado (`P2002`) |
| El mismo correo en dos clubes distintos | Permitido — `person.email` es único **por club** |
| El mismo correo de **acceso** en dos clubes | Rechazado — `user_account.email` es único **global** (`docs/09` D-05) |

Los dos últimos existen para fijar una distinción que es fácil de confundir y romper: el correo
*de contacto* de una persona y el correo *de acceso* de su cuenta son datos distintos con reglas
distintas.

### La tarea arrastró el andamiaje de pruebas de integración

Era el primer test de integración del proyecto, así que hubo que montarlo: `test/global-setup.ts`
levanta un PostgreSQL 16 con Testcontainers y le aplica las migraciones; `test/db.ts` entrega el
cliente. Se corre con `pnpm test:int` y está en el CI.

**Decisión de aislamiento, forzada por T-004.** Un contenedor por corrida (arrancar Postgres
cuesta ~15 s) y los tests **etiquetan sus datos** con un `clubId` único en vez de limpiar entre
tests. No es preferencia de estilo: `audit_log` es append-only, así que un test que escriba ahí no
puede borrar lo que escribió, ni con `DELETE` ni con `TRUNCATE`. El patrón habitual de «limpiar
entre tests» simplemente no funciona en este esquema, y descubrirlo ahora evita construir la suite
entera sobre una base equivocada.

### Bug latente encontrado: la API no arrancaba

Al hacer que `typecheck` y ESLint cubrieran también `test/`, salió un problema de la Fase 0 que
nada había detectado hasta ahora: **`apps/api` compilaba a CommonJS mientras su `package.json`
declaraba `"type": "module"`**. Consecuencia:

```
node dist/main.js
→ ReferenceError: exports is not defined in ES module scope
```

El `build` pasaba, el CI habría pasado, y **la API nunca había corrido**. Es el caso de libro de
«verde en CI, roto en producción»: ningún gate lo cubría porque ninguno arrancaba el proceso.

Corregido pasando `apps/api` a ESM de verdad (coherente con `packages/domain`, `packages/contracts`
y `apps/web`, todos ESM), con `tsconfig.json` para desarrollo/lint (incluye `src` + `test`, no
emite) y `tsconfig.build.json` para el build (sólo `src`). Verificado como debe verificarse:
arrancando el proceso y pidiéndole las dos rutas.

```
GET /health → HTTP 200 {"status":"ok"}
GET /ready  → HTTP 200 {"status":"ok"}
```

> **Lección para los gates.** Compilar no es correr. Falta un gate que arranque el proceso y le
> pida `/health` — hoy eso lo cubriría el paso de E2E, que todavía no tiene contenido real. Queda
> anotado como pendiente de la suite de E2E (T-100 en adelante).

---

## T-006 — Datos de ejemplo (`pnpm db:seed`)

**Fecha:** 2026-08-10

### Qué siembra

Un **club ficticio** (`club-demo`): 5 categorías de membresía del catálogo estándar, la versión 1
del waiver, y 3 personas con cuenta activa y un rol distinto cada una (`club_admin`,
`commissioner`, `player`), cada una con su membresía vigente.

Nada se llama Los Pinos ni Cuatro Soles, y ninguna tarifa es real. Es deliberado: la plataforma es
un producto para clubes de polo, y hardcodear el cliente cero es el primer paso para no poder
venderla (CLAUDE.md, contexto de negocio). Los datos reales entran por la interfaz de
administración.

### Idempotencia: automatizada, no verificada a mano

| Comprobación | Resultado |
|---|---|
| Tras la primera corrida | 3 personas, 3 cuentas, 3 roles, 5 categorías, 3 membresías, 1 waiver |
| Tras la segunda corrida | **exactamente los mismos conteos** |
| Los tres roles son distintos y las tres cuentas quedan `active` | ✅ |

Está en `test/integration/seed.int-spec.ts` (3 tests). Para poder escribirlo, el seed expone
`sembrarClubDemo(prisma)` y recibe el cliente en vez de crearlo — así el test lo llama dos veces
contra su propia base. Sin ese cambio, la única verificación posible habría sido manual, que es
justo la deuda que este módulo lleva arrastrando.

**Cómo se logra la idempotencia**, que no es trivial con ids aleatorios (UUID v7):
- Donde hay una clave natural única, `upsert`: categorías por `(club_id, code)`, waiver por
  `(club_id, version)`, persona por `(club_id, email)`, cuenta por `email`.
- Donde la unicidad real es un **índice parcial** o un `EXCLUDE` (roles y membresías, T-002 y
  T-003), `upsert` no sirve porque Prisma no sabe apuntar a esos constraints: se busca primero y
  se crea sólo si falta.
- El hash de contraseña **no** se reescribe en cada corrida: si alguien la cambió en desarrollo,
  el seed no debería deshacerlo.

### Detalles con intención

1. **El primer administrador se otorga el rol a sí mismo** (`grantedById` = su propia cuenta).
   No es un atajo: por definición no hay nadie antes del primer administrador. De ahí en adelante,
   quien otorga siempre es otra cuenta.
2. **El seed se niega a correr con `NODE_ENV=production`** salvo que se le pase
   `SEED_ALLOW_PRODUCTION=true`. Crea cuentas con una contraseña conocida; que eso llegue a
   producción por accidente es un incidente de seguridad, no una molestia.
3. **`prisma/` entró en `typecheck` y en ESLint.** `docs/05` §8 dice que un seed desactualizado
   respecto al esquema es un bug; ahora el compilador lo detecta en vez de que aparezca la próxima
   vez que alguien lo corra.
4. **Primer uso real de Argon2id**, verificado: el hash guardado valida la contraseña correcta,
   rechaza la incorrecta, y el algoritmo es `argon2id` (no `argon2i` ni `argon2d`).

---

## T-010 — Primera regla de dominio: quién puede iniciar sesión

**Fecha:** 2026-08-10 · 10 tests en `packages/domain/src/identity/__tests__/login.spec.ts`

### La barrera que protegía el dominio no protegía nada

Antes de escribir la primera regla se comprobó lo obvio: que `check:arch` detecte un import
prohibido. **No lo detectaba.** Se agregó a propósito un `import type { UserAccountStatus } from
"@prisma/client"` dentro de `packages/domain` y el gate pasó en verde. El proyecto llevaba cuatro
tareas creyendo que P-01 estaba protegido automáticamente.

Dos causas, la segunda peor que la primera:

1. Con pnpm la ruta real de un paquete es
   `node_modules/.pnpm/@prisma+client@X/node_modules/@prisma/client`, así que un patrón anclado
   con `^node_modules/` nunca casa.
2. Como pnpm **aísla** las dependencias, `@prisma/client` no se puede resolver desde
   `packages/domain`: dependency-cruiser lo reporta con tipo `unknown` y sin ruta en disco. Ninguna
   regla basada en el nombre resuelto o en el tipo de dependencia lo iba a ver.

**Corregido invirtiendo la regla: en vez de enumerar lo prohibido, se declara lo permitido.** El
dominio sólo puede importar archivos de `packages/domain/src`; cualquier otra cosa —npm, otro
paquete del workspace, una app, un módulo de Node— es error. Así no depende de cómo se resuelva
nada, y atrapa también el próximo paquete que a alguien le parezca inofensivo. Se agregó además una
regla que convierte **cualquier import no resoluble** en error de build.

Verificado en los dos sentidos: con el import prohibido presente el gate falla con 2 errores; sin
él, pasa. Es el mismo patrón de fallo que el `REVOKE` de T-004: código que parece proteger y no
protege.

### La regla, y por qué el orden es parte de ella

| Test | Qué fija |
|---|---|
| Cuenta activa + contraseña correcta | Entra |
| Contraseña incorrecta en cuenta activa | Error genérico |
| **Contraseña incorrecta en cuenta suspendida** | Error genérico — **no revela la suspensión** |
| **Los 4 estados con contraseña incorrecta** | **Respuesta idéntica**, un solo valor distinto en el conjunto |
| Cuenta suspendida + contraseña correcta | Motivo `suspended` (mensaje útil para su titular) |
| Cuenta archivada + contraseña correcta | Motivo `archived` |
| Cuenta invitada + contraseña correcta | Motivo `invitation_pending` |
| Ningún estado salvo `active` entra, ni con la contraseña correcta | ✅ |

El cuarto test es el que importa de verdad: comprueba que **sin la contraseña correcta los cuatro
estados son indistinguibles entre sí**. Ésa es la propiedad que impide enumerar cuentas, y está
escrita como propiedad y no como cuatro comparaciones sueltas.

### Aclaración de spec (cambia lo que ve el usuario)

El PRD Parte II §5 pide que una cuenta invitada, suspendida o archivada reciba «un mensaje acorde a
su estado», sin decir **en qué momento**. Tomado literalmente, cualquiera podría escribir un correo
y averiguar si tiene cuenta y si está suspendida: enumeración de cuentas más fuga del estado de un
tercero (P-12).

La regla quedó: **primero la contraseña, después el estado.** El titular legítimo sigue recibiendo
su mensaje útil; quien prueba correos no recibe nada. `spec.md` HU-010-04 y R-010-07 se
actualizaron para que no quede ambiguo, y el orden vive dentro de `resolveLoginOutcome` — no en el
controlador, donde una fuga quedaría a un despiste de distancia.

Consecuencia práctica declarada: una cuenta `invited` no tiene contraseña usable, así que en la
vida real siempre caerá por el camino genérico. Para esa persona el camino correcto es reenviar la
invitación (T-053), no un mensaje en la pantalla de ingreso.

### Decisiones que fijan el patrón para el resto del dominio

1. **El dominio tiene su propio vocabulario.** `AccountStatus` se define en
   `packages/domain/src/identity/accountStatus.ts` en vez de importar el enum de Prisma. Cuatro
   palabras duplicadas a cambio de poder probar las reglas del polo sin base de datos, y de que
   cambiar de ORM no toque ninguna regla de negocio.
2. **El dominio no hashea ni compara contraseñas.** Recibe `credentialsValid: boolean`, un
   veredicto ya tomado. Argon2id es una librería, y el dominio no tiene dependencias.
3. **Exhaustividad forzada por el compilador.** El `switch` sobre el estado termina en un
   `never`: si algún día se agrega un estado y nadie lo piensa, el build se rompe en vez de
   dejarlo permitido —o prohibido— por accidente.
4. **El plan se corrigió, no se ignoró.** Preveía sólo un booleano; se anotó en `plan.md` por qué
   resultó insuficiente para su propio spec.

---

## T-011 — `canAssignRole`: quién puede otorgar qué rol

**Fecha:** 2026-08-10 · 27 tests · dominio al 100 % de cobertura

Es la función más delicada del módulo: un error aquí no es un bug de permisos, es una **escalada de
privilegios**. Por eso tiene más tests que código y decide únicamente sobre datos explícitos.

### La ambigüedad que había que resolver antes de escribir nada

Dos documentos del propio repositorio se contradecían sobre si un `organization_admin` puede
nombrar a **otro** `organization_admin`:

| Fuente | Qué decía |
|---|---|
| `docs/06` §4 | `organization_admin` es «otorgado por `superadmin` o `club_admin`» → **no puede** |
| `spec.md` R-010-04 | «`organization_admin` sólo otorga roles dentro de su propia organización» → leído literalmente, **sí puede** |

**Resuelto por el lado del menor privilegio.** Si un administrador de organización pudiera
clonarse, una sola cuenta comprometida se multiplica sin que ningún administrador del club se
entere, y el club pierde la capacidad de saber quién manda en sus organizaciones. El costo es que
los nombra el club: con una o dos organizaciones, un trámite de un minuto.

Quedó escrito en `spec.md` R-010-04 y en `docs/06` §4, marcado como **decisión revisable** si en la
operación real resulta incómoda — relajarla es una línea y su test.

### Los casos del spec

| Test | Resultado |
|---|---|
| Administrador de organización intenta otorgar `commissioner` | ✅ rechazado |
| Administrador de organización intenta otorgar `club_admin` | ✅ rechazado |
| Administrador de club intenta otorgar en una organización de **otro** club | ✅ rechazado |
| Administrador de club intenta otorgar en **otro** club | ✅ rechazado |
| Administrador de organización intenta otorgar en **otra** organización | ✅ rechazado |
| Administrador de club otorga `commissioner` en su club | ✅ permitido |
| Administrador de organización otorga `instructor` y `groom` en la suya | ✅ permitido |
| Sólo un `superadmin` puede crear otro `superadmin` | ✅ |

### Tres reglas que no eran obvias y quedaron probadas

1. **Tener un rol no es poder repartirlo.** El **comisario** —máxima autoridad deportiva— no
   otorga ningún rol: su autoridad es sobre handicaps, equipos y resultados, no administrativa.
   Está probado explícitamente para que nadie lo lea como un olvido y lo «arregle».
2. **Los permisos se acumulan, pero acumular no crea autoridad** (R-010-03). Quien es jugador *y*
   administrador del club otorga como administrador; quien es jugador *y* comisario sigue sin poder
   otorgar nada. Dos tests, uno por cada mitad de la regla.
3. **Un rol sólo existe en su ámbito.** Un «comisario de organización» o un «superadministrador de
   club» se rechazan como **datos incoherentes** (`role_scope_invalid`), no como falta de
   permisos — distinguirlo importa porque son bugs distintos. `treasurer` es el único rol válido en
   dos ámbitos, y hay un test que lo comprueba recorriendo la tabla, así que si mañana alguien
   agrega otro rol de doble ámbito, se enterará.

### Dos tests que comprueban propiedades, no casos

Los más valiosos del conjunto, porque cubren combinaciones que nadie enumeró a mano:

- **«Sólo tres tipos de actor pueden otorgar algo, en algún ámbito»**: recorre los 8 roles × sus
  ámbitos válidos × 6 tipos de actor, y verifica que la lista de quienes tienen *alguna* autoridad
  es exactamente `superadmin`, `club_admin` y `organization_admin`. Si un rol ganara autoridad por
  accidente, aparece aquí.
- **«Ningún actor puede otorgar un rol en un club que no es el suyo»**: barre todos los roles de
  ámbito de club contra un club ajeno y exige que la lista de infractores esté vacía. Es la
  propiedad de aislamiento entre clubes (P-05) aplicada a los permisos.

### Datos incoherentes se rechazan antes de evaluar permisos

Cuatro tests cubren el borde: ámbito de plataforma con identificador concreto, ámbito de club sin
identificador, un rol de club cuyo club no coincide con su propio ámbito, y un rol de organización
sin saber a qué club pertenece. El último devuelve `scope_club_unknown` en vez de adivinar:
sin ese dato no hay forma de saber si un `club_admin` manda ahí, y **adivinar en una función de
permisos es exactamente cómo se abren los agujeros**.

### Pendiente declarado

- `R-010-05` (nadie se retira roles a sí mismo) **no** está aquí: es sobre *revocar*, no otorgar, y
  le corresponde a T-058 y T-061. Otorgarse un rol a uno mismo sí está permitido, y es lo que hace
  el seed con el primer administrador: por definición no hay nadie antes que él.
- `player` es el rol base que el sistema asigna al activarse una cuenta, no un otorgamiento
  discrecional. Esta función lo trata como el rol de club que es si alguien lo otorga a mano.

---

## T-012 — `isInvitationLinkValid`: hasta cuándo sirve un enlace de invitación

**Fecha:** 2026-08-10 · 10 tests · dominio al 100 % de cobertura (52 tests en total)

Regla corta con dos decisiones que no eran obvias, ambas de las que sólo se notan cuando ya
salieron mal.

### Los 7 días no son del código: son configuración

El spec dice «vence en 7 días (default, `docs/08`)». La palabra que manda ahí es **default**:
`auth.invitation_link_validity_days` está en el catálogo de configuración (`docs/08` §9), así que
escribir `7` dentro de la función habría contradicho P-04 y habría dejado un valor que sólo se
cambia con un despliegue. La ventana entra como parámetro (`InvitationLinkPolicy`) y el dominio
no sabe de dónde sale.

Consecuencia asumida y anotada en el código: si un administrador **acorta** la ventana, las
invitaciones ya enviadas se evalúan contra el valor nuevo. Es lo correcto para una regla de
seguridad —endurecerla debe surtir efecto ya, no dentro de siete días— y el peor caso es una
invitación de más que hay que reenviar.

Está probado que la ventana es de verdad configurable, no un parámetro decorativo: con 3 días
vence a los 3, con 14 sigue viva a los 8, y un test recorre `[1, 2, 3, 7, 14, 30]` exigiendo que
en todas el último instante válido sea el anterior al corte.

### El orden de las dos comprobaciones tiene consecuencia operativa

Se mira **primero si ya se usó** y sólo después el vencimiento. Un enlace usado también termina
por vencerse, así que con el orden inverso una invitación consumida por un tercero respondería
«vencida» — y el administrador la reenviaría tranquilo, sin enterarse nunca de que alguien ya la
había usado. Justamente la señal que querría ver si el correo fue interceptado. Hay un test del
caso «usada **y** vencida» que fija ese orden para que nadie lo invierta por limpieza.

### El borde exacto

A los 7 días exactos está **vencida**, no válida: un borde hay que elegirlo, y en un token de
acceso se elige por el lado que concede menos. Probado por ambos lados con precisión de
milisegundo (`7 días − 1 ms` sirve, `7 días` no).

### Firma distinta a la del plan

`spec.md` §9 la anunciaba como `(invitation, now: Date)`. Quedó
`(invitation, policy, clock: Clock)`: `Clock` porque la tarea lo pedía explícitamente y P-08
admite ambas formas, y `policy` por lo del párrafo anterior. `spec.md` §9 quedó corregido para
que la firma escrita sea la real.

### Pendiente declarado

- **La invalidación del enlace anterior al reenviar** (T-053) no está aquí. Esta función decide
  sobre `sentAt` y `usedAt`; cómo se marca muerta la invitación previa es del modelo de datos y de
  su endpoint, y todavía no existe la tabla `Invitation` en `schema.prisma` — la crea T-050.

---

## T-013 — `isWaiverAcceptanceCurrent`: quién está cubierto por la exención

**Fecha:** 2026-08-10 · 5 tests · dominio al 100 % de cobertura (57 tests en total)

Ocho líneas de código. La decisión que importa es **contra qué se compara**.

### Por identificador de versión, nunca por número

El correlativo `version` de `waiver_version` es **por club** (`@@unique([clubId, version])`), así
que «la versión 3» existe en todos los clubes a la vez. Una implementación que comparara números
—o peor, `aceptada >= vigente`— daría por cubierta en Los Pinos a una persona que firmó el texto
de otro club: una fuga entre inquilinos (P-05) escondida en un `>=` que a nadie le parecería
sospechoso en una revisión. El identificador es único en toda la plataforma y no admite esa
confusión. Hay un test explícito del caso, con dos versiones «3» de clubes distintos.

### Fallar cerrado, por diseño

La función recibe la aceptación **más reciente** de la persona, y que lo sea es responsabilidad de
quien consulta. Si el llamador se equivoca y pasa una vieja, el resultado es `false`: se vuelve a
pedir la aceptación. El error se paga con una pantalla de más, nunca con alguien jugando sin
respaldo legal — que es el único desenlace inaceptable de esta regla.

### Devuelve booleano, y aquí sí alcanza

A diferencia de T-010 —donde el booleano suelto obligaba al controlador a reconstruir el orden de
la regla— aquí no hay orden que esconder ni información que filtrar: los dos motivos de rechazo
(nunca aceptó / aceptó una versión vieja) los distingue el llamador mirando si la aceptación es
nula, y ambos llevan a la misma pantalla. Se respeta la firma del `spec.md` §9.

### Lo que esta función deliberadamente no hace

- **No elige cuál es la versión vigente.** «La de mayor correlativo ya publicada» es una consulta,
  y vive en el repositorio (T-073). Si ese `SELECT` devolviera una versión con `publishedAt` en el
  futuro, invalidaría la aceptación de todo el club: el riesgo es real pero es de allá, y queda
  anotado para T-073.
- **No contempla vencimiento por tiempo.** La política por defecto
  `identity.waiver_renewal_policy` (`docs/08` §9) es «una vez; se repite sólo si el texto cambia»,
  que es exactamente lo que hace comparar versiones. Una política tipo «revalidar cada año»
  exigiría un `Clock` inyectado; está previsto en el comentario del código para cuando se pida.
- **No sabe de menores ni de acudientes.** Quién firmó materialmente (`acceptedByPersonId`) es
  evidencia legal que guarda la fila, no una condición de vigencia: al dominio le basta con que la
  persona cubierta tenga aceptación de la versión vigente. El flujo del acudiente es T-074.

---

## T-014 — `resolvePrimaryPayer`: a quién se le cobra lo de un menor

**Fecha:** 2026-08-10 · 13 tests (+ 5 de `localDate`) · dominio al 100 % de cobertura (75 en total)

Cierra la sección B. Trajo un hallazgo que no estaba en la tarea y que habría sido un bug de plata.

### El desfase de cinco horas que nadie habría visto

`guardianship.starts_on` y `ends_on` son columnas `@db.Date`: **fechas de calendario, sin hora**.
Prisma las entrega como medianoche **UTC**. La firma que preveía el plan —`(guardianships, now:
Date)`— invitaba a escribir `now <= endsOn`, y eso significa que un vínculo que rige *hasta el 10
de agosto inclusive* se habría dado por vencido desde las **7:00 p.m. del 9 de agosto en Bogotá**,
que es cuando empieza el 10 en UTC. Se pierde el último día entero del vínculo. Nada falla, nada
se registra: simplemente el cobro del menor deja de consolidarse en el estado de cuenta de su
acudiente un día antes de tiempo, o se lo lleva el acudiente equivocado.

La respuesta no fue recordar el detalle en el momento de usar la función, sino hacer que el error
**no compile**: se agregó el tipo `LocalDate` (`packages/domain/src/shared/localDate.ts`), una
fecha `YYYY-MM-DD` sin hora ni zona, y `resolvePrimaryPayer` recibe `today: LocalDate`. Pasarle un
`Date` es un error de tipos, no un resultado sutilmente equivocado en la madrugada.

`toLocalDate(instant, timeZone)` hace la traducción, y **la zona es un parámetro**: el producto se
vende a otros clubes (`docs/09` D-01), así que `America/Bogota` no podía quedar dentro del dominio.
Hay un test con el mismo instante cayendo en días distintos según la zona, y otro que fija la
propiedad de la que depende todo lo demás: en formato con ceros a la izquierda, **orden alfabético
= orden cronológico**. El formato se arma pieza por pieza con `formatToParts` en vez de confiar en
el texto de un locale, porque ese texto cambia con la versión de ICU y aquí el formato exacto no es
cosmético.

`spec.md` §9 quedó corregido con la firma real.

### No elegir es la función

Si dos acudientes **distintos** figuran como pagador principal el mismo día, devuelve
`multiple_primary_payers`. Cualquier desempate inventado —el primero de la lista, el más antiguo—
le carga a alguien una factura que quizá no le toca, en silencio y sin que nadie lo revise. Hay un
test que compara el resultado de la lista y el de la lista invertida y exige que sean **iguales**:
si mañana alguien "arregla" la ambigüedad eligiendo alguno, ese test lo delata.

**Un caso sí se resuelve, y es una decisión, no un descuido:** varias filas solapadas que apuntan
al **mismo** acudiente devuelven `ok`. No hay elección arbitraria que hacer —la plata va al mismo
estado de cuenta de todas formas— y bloquear a la familia por un vínculo duplicado sería un castigo
sin beneficio. Sigue siendo un dato sucio; detectarlo es del job de integridad.

### Los bordes de la ventana

Ambos extremos son inclusivos: el primer día ya paga y el último todavía paga. Probado por los dos
lados, más los dos casos de fuera de ventana (terminó ayer, empieza mañana) y uno de otro año que
existe para vigilar que la comparación como texto no se rompa.

### Pendientes declarados

- **T-071** (job diario de integridad) tiene ahora dos casos que detectar, no uno: dependiente
  activo **sin** pagador vigente, y dependiente con **dos pagadores distintos** vigentes. El
  segundo bloquea cobros hasta que un humano lo corrija, así que es el más urgente de los dos.
- **T-070** debe usar la misma noción de fecha del club al cerrar el `endsOn` del pagador anterior;
  si lo hace con `now` en UTC reintroduce el desfase por el otro extremo.
- Quien llame a esta función debe pasarle los vínculos de **un solo** dependiente y de su club: la
  función no puede verificarlo con los datos que recibe. Queda anotado en su firma.

---

## T-024 — Filtro global de excepciones: una sola forma de error en todo el API

**Fecha:** 2026-08-10 · 12 tests · primera pieza de NestJS del proyecto

### Por qué esta tarea y no T-020

T-020 (`TenantGuard`) abre la sección C, pero está **bloqueada por dependencia**: resolver «club
activo por subdominio» necesita la tabla `club`, y `schema.prisma` la declara como entregable del
módulo **020**, que aún no tiene `spec.md`. Crearla desde aquí habría sido código de producción sin
spec. Quedó anotada en `tasks.md` con las dos salidas posibles.

T-024 es además el prerequisito real de los tres guards que siguen: `TenantGuard` responde `404`,
`SessionGuard` responde `401` y `PermissionGuard` responde `403`. Sin el filtro primero, cada uno
inventa su propio formato y después hay que unificarlos.

### Lo que el filtro garantiza

| Situación | Respuesta |
|---|---|
| `ApiException` (error de negocio nuestro) | su código de contrato, su mensaje y sus `details` |
| `ZodError` (payload que no cumple su esquema) | `400 VALIDATION_FAILED` + qué campos fallaron |
| Excepción de NestJS (`401`, `404` de ruta inexistente…) | **el estado sí, el mensaje no** |
| Cualquier otra cosa | `500 INTERNAL_ERROR`, mensaje fijo, error real sólo en el log |

**Descartar el mensaje de NestJS es la decisión que más protege.** Sus textos vienen en inglés y
describen la infraestructura: `Cannot GET /users` le dibuja el mapa del API a quien lo escanea, y
una `UnauthorizedException("Session cookie missing for user 42")` escrita por descuido en un
servicio publicaría el identificador de un tercero. Hay un test por cada uno de esos dos casos, y
otro que provoca un error con un nombre de columna real (`user_account.password_hash`) y exige que
no aparezca en el cuerpo.

Un test recorre las cinco familias de error y valida cada respuesta contra el esquema
`ApiErrorResponse` de `packages/contracts` — el real, no una copia (`docs/03` §4: que compile no
basta).

### El `requestId`

Se genera en un middleware que corre antes que nada, viaja en la cabecera `x-request-id` **y** en el
cuerpo del error, y es lo único que se le entrega al usuario cuando algo se rompe. Verificado a mano
sobre el binario compilado: la línea de Pino y la respuesta HTTP traen el mismo identificador.

**Nunca se reutiliza el que manda el cliente**, aunque sería cómodo para correlacionar: dejaría que
cualquiera repita un mismo identificador en miles de solicitudes y vuelva inútil la búsqueda justo
durante un incidente. Si algún día hay un proxy de confianza que deba propagar el suyo, será una
decisión explícita con su ADR.

### El montaje vive aparte de `main.ts`

`src/configure-app.ts` monta middleware y filtro, y lo llaman **tanto `main.ts` como los tests**. Es
la lección de T-005 aplicada por adelantado: allá el build pasaba y la API no arrancaba porque nada
probaba el arranque real. Un filtro global registrado sólo en `main.ts` produce el mismo problema al
revés — los tests verían una forma de error que el usuario nunca recibe.

Además de correr la suite, se levantó el binario compilado (`node dist/main.js`) y se pidió una ruta
inexistente: `404` con mensaje en español, `requestId` en cabecera y cuerpo, y su línea JSON en el
log. Eso es lo que confirma que el montaje de producción es el que se probó.

### Tres hallazgos al verificar

1. **`X-Powered-By: Express`** venía en todas las respuestas — le regala a quien escanea la lista
   exacta de tecnologías que buscar en un boletín de CVE. Se apagó (una línea, con su test). El
   endurecimiento completo de cabeceras sigue siendo una tarea aparte.
2. **Faltaban `@types/express` y `@types/supertest`**, sin los cuales `typecheck` fallaba: el
   proyecto nunca había escrito código que tocara el `Request` de Express. Agregados como
   `devDependencies` de `apps/api`.
3. **Una aplicación de Express es una función, no un objeto.** El `type guard` que evita castear el
   servidor comprobaba `typeof === "object"` y por lo tanto no apagaba nada: el montaje seguía
   corriendo, sin error, sin efecto. Lo atrapó el test de la cabecera, escrito un minuto antes —
   ejemplo exacto de por qué la verificación va junto al código y no después. Quedó documentado en
   el propio guard para que nadie lo "simplifique" de vuelta.

### Pendientes declarados

- **Los errores de Prisma no se traducen todavía.** `docs/03` §3 pide `409` para violación de
  `UNIQUE` (`23505`) y de `EXCLUDE` (`23P01`). No se implementó porque no existe aún ningún
  repositorio que los produzca, y una traducción sin caso real que la ejerza es una conjetura. Entra
  con el primer repositorio (T-050 en adelante).
- **El logger no tiene todavía correlación automática por solicitud**: hoy el `requestId` se
  escribe explícitamente en la línea de error. Cuando haya más código logueando, conviene un
  `AsyncLocalStorage` para que ninguna línea quede sin él.

---

## T-021 — `SessionGuard`: quién está del otro lado, y desde cuándo

**Fecha:** 2026-08-10 · 10 tests de integración contra Postgres real · tres commits

Primer componente del proyecto que combina base de datos, inyección de dependencias y una regla de
seguridad. Desbordó el límite de 5 archivos de `CLAUDE.md`, así que se partió: **andamiaje**
(`PrismaModule` + `ClockModule` + test de arranque de la aplicación completa), **reparaciones** que
la tarea destapó, y **el guard**.

### Todos los rechazos son el mismo rechazo

Sin cookie, cookie inventada, sesión revocada, sesión vencida, sesión que vence en este mismo
instante, cuenta suspendida y cuenta archivada: **siete caminos, un solo `401`**, sin `details` y
sin mensaje distinto. `docs/03` §3 lo pide para el estado 401 —«nunca distingue "no existe" de
"expiró"»— y la razón es P-12: un cuerpo que diferencie «esa sesión ya no existe» de «esa sesión
venció» le confirma a quien está probando cookies robadas cuáles fueron válidas alguna vez. Hay un
test que pide con cinco cookies distintas y exige que los cuerpos, sin el `requestId`, sean **uno
solo**.

### La segunda barrera que parece redundante y no lo es

El guard comprueba el estado de la cuenta además del estado de la sesión, reutilizando
`accountStatusAllowsLogin` (T-010). En teoría sobra: suspender una cuenta revoca sus sesiones en el
mismo movimiento (T-056). Pero «en teoría» es justo lo que falla — si esa revocación se rompe, o
queda una sesión emitida antes del cambio, el suspendido sigue entrando. El costo son **cero
consultas extra** (el estado viene en el mismo `select`) y lo que compra es que el corte de acceso
no dependa de que otra tarea haya hecho bien su parte.

La traducción del enum de Prisma al vocabulario del dominio se hace con una función cuyo cuerpo es
la identidad: hoy las palabras coinciden. Lo que trabaja es la **firma** — si mañana aparece un
estado nuevo en el esquema, deja de compilar y obliga a decidir si esa cuenta puede entrar.

### El token nunca toca la base de datos

Se guarda `sha256(token)` y se busca por el hash. Hay un test que lo comprueba desde los dos lados:
buscar por el token en claro no encuentra nada, buscar por su hash sí.

**SHA-256 y no Argon2id**, al revés que las contraseñas, y la diferencia es deliberada: Argon2
existe para encarecer el adivinado de un secreto de baja entropía elegido por una persona; este
token son 256 bits aleatorios —no hay diccionario que probar— y se verifica en **cada solicitud**.
Un hash costoso aquí sería una negación de servicio contra nosotros mismos.

### El guard no escribe

Un guard que actualiza `last_seen_at` convierte cada lectura en una escritura. El cierre por
inactividad (`auth.session_idle_timeout_hours`, hoy «exacto por definir» en `docs/08` §9) entra con
su propia tarea, junto con la decisión de cada cuánto refrescar.

### Dos fallos del andamiaje, encontrados aquí

1. **Vitest no emitía la metadata de decoradores.** NestJS resuelve el constructor leyendo lo que
   produce `emitDecoratorMetadata`, y esbuild no la emite: `this.prisma` llegaba `undefined` y todo
   respondía `500`. En producción funcionaba —ahí compila `tsc`—, o sea que el test mentía en la
   dirección peligrosa. Se agregó `unplugin-swc` a las dos configuraciones de Vitest en vez de
   anotar `@Inject(...)` en todo el proyecto, porque ese olvido produciría el mismo `500` pero en
   producción.
2. **`packages/domain` y `packages/contracts` apuntaban a `src/index.ts`.** Node no carga
   TypeScript: al importar `@polo/domain` desde la API compilada, el proceso moría al arrancar. No
   se había notado porque hasta hoy el único uso era `import type`, que se borra al compilar. Misma
   familia que T-005: build verde, proceso que no arranca. Ahora apuntan a `./dist`.

Ambos se verificaron levantando el binario compilado contra el Postgres de desarrollo, no sólo con
la suite.

### Pendientes declarados

- **La caché de sesión de 60 segundos que pide `docs/06` §1 no se implementó**, y conviene decidirlo
  con cuidado: choca de frente con «suspender corta el acceso de inmediato» (T-056) y con la
  revocación de sesiones (R-010-09). Una caché sin invalidación explícita al revocar convierte
  «inmediato» en «hasta un minuto después». Cuando entre, debe entrar **con** su invalidación.
- **Falta CSRF.** `docs/06` §1 exige doble envío de token en toda mutación y **no hay ninguna tarea
  que lo cubra** en `tasks.md`. Hoy no hay mutaciones, así que no hay agujero abierto, pero la
  primera (T-030, login) ya lo necesita. Debe agregarse una tarea antes de la sección D.
- **La cookie no lleva todavía prefijo `__Host-`** ni se emiten sus atributos (`httpOnly`,
  `Secure`, `SameSite=Lax`): eso ocurre al **crear** la sesión, que es T-030. El nombre de la cookie
  y el formato del token ya viven en `session-token.ts` para que login los reutilice y no invente
  otros.
- **El guard todavía no es global.** Se aplica con `@UseGuards(SessionGuard)`. La obligatoriedad
  —que una ruta mutante sin declarar permiso impida arrancar la aplicación— es T-022.

---

## T-022a — `hasPermission`: la matriz de permisos como regla, no como plomería

**Fecha:** 2026-08-10 · 21 tests · dominio al 100 % de cobertura (96 tests en total)

T-022 pide un decorador y un guard, pero adentro hay una **regla de negocio** —quién puede qué, y
dónde— y esa mitad no depende de NestJS. Va en `packages/domain` (P-01), donde se prueba sin
levantar una aplicación ni una base de datos. El guard queda para T-022b.

### Qué puede cada rol, y dónde, en una sola tabla

Cada rol declara junto **su lista de permisos** y **su alcance**. Van juntos a propósito: separados,
se puede agregar un permiso a un rol y olvidar acotarle el ámbito, que es la mitad silenciosa del
problema.

Las tres filas administrativas tienen hoy la misma lista de permisos, y no es un error de
transcripción: la diferencia entre un `club_admin` y un `organization_admin` no está en *qué*
permisos tienen sino en *dónde*. Se escribe igual la tabla completa porque es lo que hace que
agregar un permiso obligue a decidir, rol por rol, quién lo tiene. Con una regla implícita —«los
administradores pueden todo»— un permiso nuevo quedaría concedido por omisión, que es exactamente
como se abren los agujeros.

### Es la puerta gruesa, y está declarado que lo es

`hasPermission` responde «este actor tiene autoridad administrativa **aquí**». La regla fina de cada
operación vive aparte —`canAssignRole` (T-011) para otorgar roles— y se evalúa después, en el
servicio. Las dos capas son deliberadas (`plan.md` §7): el guard impide que una petición de otro
ámbito llegue siquiera a la lógica, y la función de dominio decide el caso exacto. Que la puerta
gruesa sea permisiva con el detalle no es un descuido; lo sería si fuera la única.

Lo que sí queda cerrado en la puerta es **R-010-04**: un `organization_admin` no pasa ningún permiso
con ámbito de club, ni siquiera el de su propio club. Está probado explícitamente.

### Dos tests que comprueban propiedades, no casos

Los mismos dos que en T-011, y por la misma razón — cubren combinaciones que nadie enumeró:

- **«Ningún rol operativo pasa ningún permiso, en ningún ámbito válido»**: recorre los cinco roles
  no administrativos × sus ámbitos válidos × los siete permisos, y exige lista de infractores
  vacía. Si al agregar un permiso alguien lo concede de más, aparece aquí.
- **«Sólo tres roles tienen alguna autoridad»**: barre los ocho roles y verifica que la lista es
  exactamente `superadmin`, `club_admin`, `organization_admin`.

Además, un test exige que **ningún permiso del catálogo quede muerto** —sin nadie que pueda
ejercerlo—, que es el error opuesto y también silencioso.

### Pendientes declarados

- **Dos filas de la matriz de `docs/06` §4 no tienen todavía nombre canónico de permiso**: «editar
  categoría de membresía» y «configurar reglas globales». No se inventaron: `plan.md` §4 nombra
  siete permisos y son los que están. La primera la necesita T-072; la segunda pertenece a
  `specs/020` (configuración). Cada una nombra el suyo al llegar.
- El catálogo no cubre `/me`: editar el propio perfil no pasa por permiso sino por ser el dueño de
  la sesión (T-040 en adelante).

---

## T-022b — `@RequirePermission`, `PermissionGuard` y el arranque que se niega

**Fecha:** 2026-08-10 · 16 tests (6 de arranque + 10 de integración) · cobertura del API al 85,8 %

### El criterio de la tarea no era «responde 403»

Era: **una ruta mutante sin permiso declarado impide arrancar la aplicación** (`ADR-014` punto 4,
P-13). La diferencia importa. Una ruta mutante sin `@RequirePermission()` no se ve rota: responde
`200`, pasa sus tests y queda abierta a cualquiera con sesión — un jugador borrando usuarios. Este
proyecto no tiene un segundo par de ojos revisando diffs (`docs/09` D-04), así que el único control
que no depende de que alguien se acuerde es el que rompe el despliegue.

`PermissionsDeclaredService` recorre al arrancar todos los controladores registrados y reporta
**la lista completa** de rutas ofensoras, no la primera: con tres rutas mal, el objetivo es
arreglar las tres de una vez y no descubrirlas de a una por despliegue. Los `GET` quedan fuera —
leer no cambia nada, y exigirles permiso obligaría a inventar uno por cada listado.

El decorador acepta el tipo `Permission` de `packages/domain`, así que **un permiso inventado no
compila**: sin eso, un `@RequirePermission("user.crear")` con una errata pasaría la revisión y
dejaría la ruta exigiendo algo que nadie tiene.

### El guard falla cerrado, y distingue «no puedes» de «no sé»

| Situación | Respuesta |
|---|---|
| Rol con autoridad en ese club | pasa |
| Sesión válida sin autoridad (jugador, comisario) | `403` |
| Administrador de **otro** club | `403` |
| Administrador de organización sobre ámbito de club (R-010-04) | `403` |
| Rol **revocado** | `403` |
| Sin sesión | `401`, sin llegar a mirar permisos |
| Sin tenant resuelto | **error interno**, no `403` |

El último es la decisión menos obvia y la que más se agradece a las 3 a.m.: un `403` diría «no
tienes permiso» cuando lo que ocurre es que el servidor no sabe en qué club está parado. Son
problemas distintos y confundirlos manda a depurar al lado equivocado. Que el guard **no adivine**
el tenant es el punto: un guard de autorización que ante la duda deja pasar no es un guard.

El caso del rol revocado vale por sí solo: la consulta filtra `revokedAt: null`, así que retirar un
rol tiene efecto en la siguiente petición, sin esperar a que expire ninguna sesión (T-061).

### La dependencia con T-020, declarada en el código

`PermissionGuard` lee el club de `req.tenant`, que llenará `TenantGuard` (T-020, hoy bloqueada por
la tabla `club` del módulo 020). El contrato se declaró ahora, en `permission.guard.ts`, en vez de
improvisarlo después: así la dependencia se ve en el código en lugar de vivir en la cabeza de
alguien. El test la simula con un middleware que **vive en `test/`** y toma el club de una cabecera
— un club que llega en una cabecera del cliente es justo lo que P-05 prohíbe, y por eso no está en
`src/`.

### Un gate de cobertura que había que arreglar sin bajarlo

Los guards sólo los ejercen los tests de **integración**, que corren en otra configuración de
Vitest. La cobertura del API medida sólo sobre la suite unitaria cayó a **40 %**, por debajo del
umbral de 50 % — y el camino fácil (bajar el umbral, o escribir tests con Prisma simulado para
levantar el número) está prohibido por la regla 12 de `CLAUDE.md`, y además probaría el simulacro
en vez del guard.

`test:cov` ahora corre las dos suites con `--reporter=blob` y las combina con `--merge-reports`
antes de evaluar el umbral: **85,8 %** sobre 53 tests. Los pasos intermedios corren con los
umbrales en cero porque el umbral real se aplica al total; no se bajó ningún gate, se corrigió qué
se estaba midiendo.

### Pendientes declarados

- **Las rutas de ámbito de organización todavía no se pueden autorizar**: el guard evalúa siempre
  contra el club del tenant. Resolver «qué organización es el objetivo» exige mirar el cuerpo o la
  ruta de cada endpoint, y ese resolvedor entra con el primero que lo necesite (T-052, T-054) — no
  antes de tener un caso real que lo defina. Hasta entonces un `organization_admin` no pasa ningún
  permiso, que es el lado seguro del error.
- **El guard no se aplica solo.** Se pone con `@UseGuards(SessionGuard, PermissionGuard)`. Lo que
  el arranque garantiza es que la ruta **declare** su permiso, no que tenga el guard montado.
  Cuando exista el primer controlador de negocio conviene registrarlos como `APP_GUARD` globales
  con una excepción explícita para las rutas públicas, y ahí la garantía pasa a ser completa.

---

## T-023 — `AuditInterceptor`: el rastro se escribe solo, o no existe

**Fecha:** 2026-08-10 · 8 tests de integración · cobertura del API al 86,8 % (61 tests)

Cierra la sección C salvo T-020. El criterio de la tarea era **exactamente una fila** por mutación
marcada, y está probado literalmente: ni cero (se perdió el rastro) ni dos (aparece un cambio que
nunca ocurrió).

### Qué es automático y qué no puede serlo

| Dato | De dónde sale |
|---|---|
| quién | `sessionUser` de la sesión; nulo si actuó el sistema |
| cuándo | `occurred_at`, de la base |
| en qué club | el tenant de la solicitud |
| `requestId` | el mismo que recibió el cliente y que loguea Pino |
| sobre qué entidad | lo anotado por el servicio → el `id` de la respuesta → el `:id` de la ruta |
| el **después** | la respuesta del manejador |
| el **antes** | lo aporta el servicio con `anotarEstadoPrevio` |

El «antes» es el único que **no se puede inferir**, y conviene entender por qué antes de que a
alguien le parezca una omisión: leerlo de forma genérica exigiría que el interceptor supiera qué
tabla y qué identificador consultar para cada acción, y una consulta adivinada en la ruta caliente
—que además duplica lecturas— es peor que una línea explícita en el servicio, que ya tiene la fila
en la mano.

Si el identificador de la entidad no aparece por ninguna de las tres vías, **falla**. Una fila de
auditoría que no sabe sobre qué entidad fue no responde la única pregunta que la auditoría existe
para responder, y escribirla igual con un valor vacío es peor que no escribirla: parece que hay
rastro.

### Sólo se audita lo que ocurrió

Una mutación que falla no deja fila. Un registro con un intento fallido por línea deja de servir
para «¿qué le pasó a esta cuenta?» y pasa a ser un log de tráfico, donde encontrar el cambio real
entre cien rechazos es exactamente el trabajo que la auditoría debería ahorrar. Los intentos
rechazados son otra cosa —seguridad, no historia— y ya viven en el log de Pino con su `requestId`.

### Lo que entra ahí no se puede corregir nunca

`audit_log` es append-only por triggers (P-07, T-004), así que un secreto que se cuele queda para
el resto de la vida del sistema —ni el superusuario de la base puede quitarlo—. Por eso la limpieza
va **antes** de escribir y **por nombre de campo** (`password`, `passwordHash`, `token`,
`tokenHash`, `ipHash`), no confiando en que ningún servicio lo pase por descuido. Hay un test cuyo
controlador devuelve deliberadamente un `passwordHash` en la respuesta y exige que no aparezca en
la fila — y que el resto del contenido sí.

Otro test vuelve a comprobar, ya desde la aplicación real y no desde `psql`, que la fila escrita no
se puede modificar ni borrar: es la garantía de T-004 verificada por el camino por el que de verdad
va a llegar el dato.

### Un hallazgo, cortesía de T-022

La primera corrida de este test **no arrancó**: el controlador de prueba tenía rutas `POST` sin
`@RequirePermission()` y la comprobación de arranque lo rechazó. Funcionó exactamente como debía, y
sobre código escrito una hora después que ella. Vale como evidencia de que el control no es
decorativo: alcanza a todo el que registre una ruta mutante, incluidos los tests.

### Pendientes declarados

- **La fila se escribe fuera de la transacción del cambio.** Si el proceso muere entre el `COMMIT`
  del cambio y el `INSERT` de la auditoría, el cambio queda sin rastro. `docs/03` §9 prescribe el
  interceptor global y así está implementado, pero cuando exista el primer servicio con transacción
  propia (T-050) hay que evaluar mover el `INSERT` adentro. Hoy, si el `INSERT` falla, la respuesta
  falla con él: se prefiere que el operador se entere a perder la traza en silencio.
- **`onBehalfOfId` no se llena todavía**: la actuación por delegación (subcomisario) llega con el
  módulo deportivo. La columna existe y el interceptor la dejará poner por la misma vía que el
  «antes».
- **El interceptor no se aplica solo**: va con `@UseInterceptors(AuditInterceptor)`. Cuando los
  guards pasen a ser globales (ver T-022b), este debería acompañarlos — y ahí T-081 (cada acción de
  R-010-11 deja exactamente una fila) se vuelve comprobable de punta a punta.

---

## T-025 — CSRF: doble envío **firmado**

**Fecha:** 2026-08-11 · 7 tests de integración · tarea agregada al cerrar T-021

### Por qué no alcanzaba el doble envío de siempre

El patrón habitual —una cookie legible y la misma cadena en una cabecera, comparadas entre sí— se
cae con nuestra topología. Un subdominio por club (ADR-013) significa que `otro-club.polo.app` puede
**escribir** una cookie para `.polo.app`, que el navegador enviará también a `mi-club.polo.app`. Al
atacante le basta con poner el mismo valor en la cookie y en la cabecera: la comparación pasa y la
mutación se ejecuta con la sesión de la víctima.

El token se deriva de la sesión: `HMAC(secreto, sha256(token de sesión))`. Para calcular uno válido
hay que conocer el token de sesión, que viaja en una cookie `httpOnly` y **no se puede leer desde
otro subdominio**. Si el atacante sobreescribe la cookie de CSRF, deja de coincidir con la sesión y
la solicitud se rechaza. Ese caso tiene su test, escrito como el ataque: cookie de sesión legítima
+ cookie de CSRF elegida por el atacante + cabecera con ese mismo valor → `403`.

### Middleware global, no guard

Un guard hay que acordarse de poner en cada controlador, y **una protección que depende de que
alguien se acuerde no es una protección**. Como middleware cubre todo lo que se monte de aquí en
adelante, incluido lo que todavía no existe. Va después de `cookie-parser` —necesita leer la cookie
de sesión— y antes del filtro de errores, para que su rechazo salga con la forma de siempre.

### Qué no toca, y por qué

- **Los `GET`**: no cambian nada.
- **Las mutaciones sin sesión**: sin cookie de sesión no hay autoridad que un tercero pueda usar
  desde el navegador de la víctima, que es exactamente lo que CSRF explota. Esas rutas responden
  `401` por su cuenta.

### Detalles con consecuencia

- La comparación es en **tiempo constante**. Con `===`, lo que tarda en fallar filtra cuántos
  caracteres iniciales acertó quien está probando, y aquí lo comparado es un secreto.
- Responde `403` y no `401`: la sesión es válida; lo que falta es la prueba de que la petición la
  originó nuestra aplicación.
- El token de **otra sesión** no sirve, y tiene test: es la mitad que el doble envío simple no
  cubre.

### El costo, que conviene tener escrito

Al entrar, **56 tests de integración se pusieron en rojo**: todos hacían mutaciones con sesión y sin
token. Es la mejor señal posible de que la protección es real y global. Se agregó un ayudante
`conSesion(peticion, token)` en `test/db.ts` que pone las dos cosas juntas, porque un ayudante que
pusiera sólo la cookie dejaría a cada test la mitad del trabajo — y los que se olvidaran fallarían
por una razón que no tiene que ver con lo que prueban.

### Pendientes declarados

- **Nadie emite todavía la cookie `polo_csrf`**: la pone el login (T-030), que es la tarea
  siguiente. Hoy el token se calcula en los tests. Sin esa cookie, un frontend real no podría
  mandar la cabecera — así que **T-030 tiene que emitirla o el sistema queda inusable**.
- **El secreto tiene un default de desarrollo.** Que sea público no rompe la protección —forjar un
  token exige además el token de sesión de la víctima, que es `httpOnly`— pero quita la segunda
  capa. En el despliegue es obligatorio (`.env.example`, `docs/07`).
- **La cookie de sesión debe emitirse sin atributo `Domain`** para que no la comparta el resto de
  los subdominios. Es responsabilidad de T-030, y es la otra mitad de esta defensa.

---

## T-030 — `POST /auth/login`

**Fecha:** 2026-08-11 · 20 tests de integración (205 en total)

### El agujero que encontró registrar la ruta

La suite de aislamiento (T-261 de `specs/020`) exige que **toda ruta registrada** declare qué se
espera de ella cuando la llama alguien de otro club. Al preguntarse eso para `POST /auth/login`
apareció el problema:

**Cualquiera con cuenta en un club podía iniciar sesión por el subdominio de otro.** No obtendría
permisos —sus roles son de su club— pero las rutas que sólo exigen sesión (el detalle del club, los
listados de organizaciones, temporadas y categorías) le habrían quedado abiertas. Un club leyendo
la estructura de otro con sólo tener una cuenta propia.

Ahora una cuenta entra sólo donde pertenece, y hay tres formas de pertenecer: su persona es de ese
club, tiene un rol de ámbito de club **ahí** (nuestro personal de servicio, `specs/140` HU-140-03),
o es `superadmin`. La respuesta al rechazo es la misma que para una contraseña incorrecta: decir
«tu cuenta no es de este club» confirmaría que existe (P-12). Los dos casos tienen test.

### Las dos decisiones que se tomaron aquí, con su razón

**Duración de la sesión — 12 horas, o 30 días con «recordarme».** No estaba en `docs/08`: lo que sí
está, y quedó «por definir», es el cierre por *inactividad*. Las 12 horas cubren una jornada del
administrador y obligan a volver a entrar al día siguiente, que es lo que protege un dispositivo
compartido —la computadora de la secretaría—. Los 30 días son para quien mira desde su celular si
quedó cupo el sábado: pedirle contraseña cada vez es lo que hace que la gente vuelva a WhatsApp,
que es el problema que vinimos a resolver. Si el club pide otra cosa, pasa a ser configuración con
su clave en `docs/08`.

**Argon2id: 19 MiB, 2 iteraciones, paralelismo 1** — el perfil de OWASP para servidores modestos,
que es lo que hay (`docs/07`). Se fijan explícitamente y no se deja el default de la librería:
ese default cambia entre versiones, y un `pnpm update` no debería mover el costo de verificar una
contraseña sin que nadie lo decida. Están juntos y comentados para que la revisión de la primera
auditoría sea mirar un archivo.

### Detalles que no se ven pero cambian el resultado

- **El tiempo de respuesta es el mismo exista o no la cuenta.** Si no hay cuenta, igual se verifica
  la contraseña contra un hash señuelo. Sin eso, la diferencia entre milisegundos y el costo de
  Argon2 diría qué correos tienen cuenta sin necesidad de leer ninguna respuesta.
- **`PasswordService.verificar` nunca lanza.** Un hash inservible —el que tienen las cuentas
  invitadas— haría que `argon2.verify` lanzara, y eso saldría como `500`: distinguible desde afuera
  de un `401`, y por lo tanto una forma de averiguar qué cuentas tienen contraseña utilizable.
- **El token no viaja en el cuerpo**, sólo en la cookie `httpOnly`: devolverlo también anularía esa
  protección, bastaría un XSS. Hay un test que compara la lista exacta de campos de la respuesta.
- **La cookie de sesión se emite sin atributo `Domain`**, que es la mitad silenciosa de la defensa
  CSRF: así es de este host y sólo de este host, y el subdominio de otro club no la recibe.
- **Entrar bien borra el contador de intentos fallidos**, o cuatro errores de tipeo repartidos en un
  mes acabarían bloqueando a alguien que nunca falló dos veces seguidas.

### La otra mitad de T-025

El login emite la cookie `polo_csrf` que la protección de T-025 esperaba y que nadie ponía. Hay un
test que comprueba que **el token emitido es exactamente el que el middleware espera**: si no
coincidieran, el sistema quedaría inusable para un cliente real y ningún test de T-025 lo habría
notado, porque allá el token se calcula.

### `@RutaPublica`, la excepción que no es un hueco

La comprobación de arranque de T-022 rechazó esta ruta: es mutante y no declara permiso. No podía
declarar ninguno —iniciar sesión es lo que uno hace *antes* de tener autoridad— así que se agregó
`@RutaPublica("motivo")`, que **exige el motivo por escrito y falla el arranque si está vacío**. La
alternativa —dejar que una ruta mutante simplemente no declare nada— habría convertido la
comprobación de `ADR-014` punto 4 en una formalidad que cualquiera saltea olvidándose.

### Pendientes declarados

- **El bloqueo por intentos fallidos no está** (T-032): el contador se limpia al entrar bien, pero
  nadie lo incrementa todavía ni comprueba `lockedUntil`.
- **El mensaje por estado de cuenta** (T-033) tampoco: hoy invitada, suspendida y archivada reciben
  el mismo `401` genérico. El dominio ya distingue los cuatro motivos desde T-010; falta que el
  controlador los use **sólo para quien demostró conocer su contraseña**.
- **No hay `logout`** (T-034) ni límite de tasa (T-032, `docs/03` §3 `429`).

---

## T-031 — El rechazo genérico, comparado en serio

**Fecha:** 2026-08-11 · 2 tests nuevos (22 en el archivo de login)

La tarea pedía comparar dos cuerpos byte a byte. Se comparan **cuatro** formas de fallar —correo
inexistente con contraseña buena, correo inexistente con contraseña cualquiera, y dos contraseñas
incorrectas distintas sobre una cuenta real— y se exige que la huella sea **una sola**: mismo
cuerpo (sin el `requestId`, que es aleatorio por definición) y mismo estado.

Un segundo test compara **las cabeceras**, que es por donde se escapan estas cosas: si un camino
emitiera un `Set-Cookie` y el otro no, o si alguno agregara una cabecera propia, la diferencia sería
visible sin leer el cuerpo. También exige que un rechazo no emita ninguna cookie.

### Un mensaje que estaba mal y que este test destapó

El login respondía con el genérico del catálogo de errores: **«Debes iniciar sesión para
continuar»**. Es correcto para una ruta que exige sesión y desconcertante para quien acaba de
escribir su contraseña — parece que el sistema no se enteró de que lo intentó. Ahora tiene el suyo,
«Correo o contraseña incorrectos», con código `CREDENTIALS_INVALID`, e **idéntico en los cuatro
caminos**.

La función que lo construye está aislada y comentada precisamente para que nadie la haga más
específica con buena intención: cualquier diferencia —el mensaje, el código, el estado, una
cabecera— convierte el login en un detector de correos registrados.
